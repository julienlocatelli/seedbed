"""Prepare a local ticket branch without writing specification artifacts."""
import argparse
import fcntl
import json
import re
import subprocess
import sys
import uuid
from pathlib import Path

TYPES = ('feature', 'fix', 'bugfix', 'hotfix', 'release', 'docs', 'chore')


class Failure(Exception):
    def __init__(self, code, message, **context):
        self.error = dict(code=code, message=message, **context)


def git(repo, *args, check=True):
    result = subprocess.run(['git', '-C', str(repo), *args], capture_output=True, text=True)
    if check and result.returncode:
        # Do not print arbitrary Git stderr: URLs and hook output can contain secrets.
        raise Failure('GIT_FAILURE', 'Git operation failed: ' + args[0])
    return result


def read_association(path):
    try:
        data = json.loads(path.read_text())
        if not isinstance(data, dict):
            raise ValueError()
        data['page_id'] = str(uuid.UUID(data['page_id']))
        return data
    except (OSError, ValueError, KeyError, TypeError):
        raise Failure('ASSOCIATION_CONFLICT', 'Invalid ticket association: ' + str(path))


def prepare(args):
    try:
        page = str(uuid.UUID(args.page_id))
        if not re.fullmatch(r'[1-9][0-9]*', args.ticket):
            raise ValueError()
        number = int(args.ticket)
    except ValueError:
        raise Failure('INVALID_INPUT', 'Expected a valid page UUID and positive decimal TASK.')
    if args.type not in TYPES or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+){0,3}', args.description):
        raise Failure('INVALID_INPUT', 'Expected allowed type and one to four ASCII slug words.')
    proposed = args.branch_name or f'{args.type}/{number}-{args.description}'
    def valid_name(name):
        return (isinstance(name, str) and re.fullmatch(
            r'(?:feature|fix|bugfix|hotfix|release|docs|chore)/' + str(number)
            + r'-[a-z0-9]+(?:-[a-z0-9]+){0,3}', name))
    if not valid_name(proposed) or (args.branch_name and not proposed.startswith(args.type + '/')):
        raise Failure('INVALID_INPUT', 'Explicit branch must match the ticket and selected type.')
    repo = Path(args.repo).resolve()
    probe = git(repo, 'rev-parse', '--show-toplevel', check=False)
    if probe.returncode:
        raise Failure('NOT_GIT_REPOSITORY', 'Expected a Git working tree.')
    repo = Path(probe.stdout.strip()).resolve()
    common = Path(git(repo, 'rev-parse', '--git-common-dir').stdout.strip())
    if not common.is_absolute():
        common = repo / common
    with (common / 'specify-branch.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Failure('CONCURRENT_RUN', 'Another branch preparation is running.')
        current = git(repo, 'symbolic-ref', '--quiet', '--short', 'HEAD', check=False)
        if current.returncode:
            raise Failure('DETACHED_HEAD', 'Select a local branch before Specify.')
        current = current.stdout.strip()
        for marker in ('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer'):
            path = Path(git(repo, 'rev-parse', '--git-path', marker).stdout.strip())
            if not path.is_absolute():
                path = repo / path
            if path.exists():
                raise Failure('GIT_OPERATION_IN_PROGRESS', 'Complete the current Git operation.', current_branch=current)
        associations = list((repo / 'specs').glob('*/notion-source.json'))
        supplied = Path(args.association).resolve() if args.association else None
        if supplied and supplied not in [p.resolve() for p in associations]:
            associations.append(supplied)
        matched = []
        owners = {}
        for path in associations:
            a = read_association(path)
            if supplied and path.resolve() == supplied and a['page_id'] != page:
                raise Failure('ASSOCIATION_CONFLICT', 'Supplied association belongs to another page.')
            ticket = a.get('ticket_number')
            if a['page_id'] == page:
                if ticket is not None and (isinstance(ticket, bool) or ticket != number):
                    raise Failure('ASSOCIATION_CONFLICT', 'Ticket number changed in association.')
                matched.append(a)
            elif ticket == number:
                raise Failure('ASSOCIATION_CONFLICT', 'TASK already belongs to another page.')
            if a.get('branch_name'):
                previous = owners.setdefault(a['branch_name'], a['page_id'])
                if previous != a['page_id']:
                    raise Failure('ASSOCIATION_CONFLICT', 'Branch has multiple page owners.')
        if len(matched) > 1:
            raise Failure('ASSOCIATION_CONFLICT', 'Multiple directories associated with this page.')
        association = matched[0] if matched else {}
        target = association.get('branch_name') or proposed
        if not valid_name(target):
            raise Failure('ASSOCIATION_CONFLICT', 'Associated branch is not valid for this ticket.')
        if args.branch_name and association.get('branch_name') and args.branch_name != target:
            raise Failure('ASSOCIATION_CONFLICT', 'Explicit branch contradicts association.')
        if target in owners and owners[target] != page:
            raise Failure('ASSOCIATION_CONFLICT', 'Branch belongs to another page.')
        if git(repo, 'check-ref-format', '--branch', target, check=False).returncode:
            raise Failure('INVALID_INPUT', 'Invalid Git branch reference.')
        branches = git(repo, 'for-each-ref', '--format=%(refname:strip=2)', 'refs/heads').stdout.splitlines()
        candidates = [b for b in branches if valid_name(b)]
        if not association.get('branch_name') and not args.branch_name:
            # Active exact target can be resumed after an interrupted first creation.
            if candidates and not (candidates == [target] and current == target):
                raise Failure('ASSOCIATION_CONFLICT', 'Select an existing candidate explicitly.', candidates=candidates)
        exists = target in branches
        if association.get('branch_name') and not exists:
            raise Failure('ASSOCIATION_CONFLICT', 'Associated local branch is missing.')
        if not exists:
            remotes = git(repo, 'for-each-ref', '--format=%(refname)', 'refs/remotes').stdout.splitlines()
            if any(ref.partition('refs/remotes/')[2].partition('/')[2] == target for ref in remotes):
                raise Failure('REMOTE_ONLY_BRANCH', 'Candidate exists only remotely; no fetch performed.')
        worktrees = git(repo, 'worktree', 'list', '--porcelain').stdout.split('\n\n')
        for block in worktrees:
            lines = block.splitlines()
            if 'branch refs/heads/' + target in lines:
                location = next((l[9:] for l in lines if l.startswith('worktree ')), '')
                if Path(location).resolve() != repo:
                    raise Failure('BRANCH_IN_OTHER_WORKTREE', 'Target branch is active in another worktree.')
        if current != target:
            status = git(repo, 'status', '--porcelain=v1', '--untracked-files=all').stdout.splitlines()
            if status:
                raise Failure('DIRTY_WORKTREE', 'Preserve local work before switching branches.',
                              current_branch=current, affected_files=[l[3:] for l in status])
        base = association.get('base_commit')
        if base is not None and not (isinstance(base, str) and re.fullmatch(r'[a-f0-9]{40,64}', base)):
            raise Failure('ASSOCIATION_CONFLICT', 'Invalid recorded base commit.')
        if not exists:
            main = git(repo, 'rev-parse', '--verify', 'refs/heads/main^{commit}', check=False)
            if main.returncode:
                raise Failure('MAIN_MISSING', 'Local main is missing; no fetch performed.')
            base = main.stdout.strip()
            git(repo, '-c', 'core.hooksPath=/dev/null', 'switch', '-c', target, base)
        elif current != target:
            git(repo, '-c', 'core.hooksPath=/dev/null', 'switch', target)
        if git(repo, 'symbolic-ref', '--short', 'HEAD').stdout.strip() != target:
            raise Failure('GIT_FAILURE', 'Branch selection could not be verified.')
        return dict(BRANCH_NAME=target, TICKET_NUMBER=number, BASE_REF='refs/heads/main',
                    BASE_COMMIT=base, ACTION='reused' if exists else 'created')


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise Failure('INVALID_INPUT', message)


def main():
    parser = Parser(description=__doc__)
    for flag in ('repo', 'page-id', 'ticket', 'type', 'description'):
        parser.add_argument('--' + flag, required=True)
    parser.add_argument('--branch-name')
    parser.add_argument('--association')
    try:
        print(json.dumps(prepare(parser.parse_args())))
        return 0
    except Failure as failure:
        print(json.dumps({'error': failure.error}))
    except (OSError, subprocess.SubprocessError):
        print(json.dumps({'error': {'code': 'GIT_FAILURE', 'message': 'Local operation failed.'}}))
    return 1


if __name__ == '__main__':
    sys.exit(main())
