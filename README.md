# checkout-git-dedup

[![Build and Test](https://github.com/bhouston/checkout-git-dedup/actions/workflows/test.yml/badge.svg)](https://github.com/bhouston/checkout-git-dedup/actions/workflows/test.yml)

A fork of [actions/checkout](https://github.com/actions/checkout) that calls **git-dedup directly** for checkout operations. Replace the action in your workflow:

```yaml
steps:
  - uses: bhouston/checkout-git-dedup@main
```

Install git-dedup on the runner once, alongside native Git. No `git` shim or action-specific configuration is required. The action uses the runner's existing git-dedup settings, including `GIT_DEDUP_STORE` and `git-dedup.gitPath`; the default shared store stays in `~/.git-dedup`. Keep that store between jobs on a self-hosted runner to reuse objects across CI runs. The wrapper and its Node.js runtime must be on the runner's `PATH`, including the post-job cleanup step.

Use a git-dedup build with pool-backed fetch support ([git-dedup#144](https://github.com/bhouston/git-dedup/pull/144), currently available on `main`). The npm 2.1.0 release predates that feature. Native Git is still required, and the action itself uses the Node.js 24 Actions runtime.

All upstream checkout inputs and outputs remain available. git-dedup upgrades bandwidth-oriented depth and supported partial-clone filter requests to full history through its store; sparse checkout still limits working-tree files. This does not automatically create local branches or tags beyond the requested refspecs. A missing git-dedup installation fails with an installation message rather than silently bypassing caching.

Checkout authentication and post-job cleanup follow upstream. Temporary global Git configuration includes the runner's settings (including XDG and nested includes) while preserving `HOME`, so checkout does not redirect the default store into a temporary directory. The runner's permanent global configuration is left intact.

# Usage

<!-- start usage -->
```yaml
- uses: bhouston/checkout-git-dedup@main
  with:
    # Repository name with owner. For example, actions/checkout
    # Default: ${{ github.repository }}
    repository: ''

    # The branch, tag or SHA to checkout. When checking out the repository that
    # triggered a workflow, this defaults to the reference or SHA for that event.
    # Otherwise, uses the default branch.
    ref: ''

    # Personal access token (PAT) used to fetch the repository. The PAT is configured
    # with the local git config, which enables your scripts to run authenticated git
    # commands. The post-job step removes the PAT.
    #
    # We recommend using a service account with the least permissions necessary. Also
    # when generating a new PAT, select the least scopes necessary.
    #
    # [Learn more about creating and using encrypted secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets)
    #
    # Default: ${{ github.token }}
    token: ''

    # SSH key used to fetch the repository. The SSH key is configured with the local
    # git config, which enables your scripts to run authenticated git commands. The
    # post-job step removes the SSH key.
    #
    # We recommend using a service account with the least permissions necessary.
    #
    # [Learn more about creating and using encrypted secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets)
    ssh-key: ''

    # Known hosts in addition to the user and global host key database. The public SSH
    # keys for a host may be obtained using the utility `ssh-keyscan`. For example,
    # `ssh-keyscan github.com`. The public key for github.com is always implicitly
    # added.
    ssh-known-hosts: ''

    # Whether to perform strict host key checking. When true, adds the options
    # `StrictHostKeyChecking=yes` and `CheckHostIP=no` to the SSH command line. Use
    # the input `ssh-known-hosts` to configure additional hosts.
    # Default: true
    ssh-strict: ''

    # The user to use when connecting to the remote SSH host. By default 'git' is
    # used.
    # Default: git
    ssh-user: ''

    # Whether to configure the token or SSH key with the local git config
    # Default: true
    persist-credentials: ''

    # Relative path under $GITHUB_WORKSPACE to place the repository
    path: ''

    # Whether to execute `git clean -ffdx && git reset --hard HEAD` before fetching
    # Default: true
    clean: ''

    # Partially clone against a given filter. Overrides sparse-checkout if set.
    # Default: null
    filter: ''

    # Do a sparse checkout on given patterns. Each pattern should be separated with
    # new lines.
    # Default: null
    sparse-checkout: ''

    # Specifies whether to use cone-mode when doing a sparse checkout.
    # Default: true
    sparse-checkout-cone-mode: ''

    # Number of commits requested. git-dedup upgrades supported shallow fetches to
    # full history from its shared store. 0 fetches all branches and tags.
    # Default: 1
    fetch-depth: ''

    # Whether to fetch tags, even if fetch-depth > 0.
    # Default: false
    fetch-tags: ''

    # Whether to show progress status output when fetching.
    # Default: true
    show-progress: ''

    # Whether to download Git-LFS files
    # Default: false
    lfs: ''

    # Whether to checkout submodules: `true` to checkout submodules or `recursive` to
    # recursively checkout submodules.
    #
    # When the `ssh-key` input is not provided, SSH URLs beginning with
    # `git@github.com:` are converted to HTTPS.
    #
    # Default: false
    submodules: ''

    # Add repository path as safe.directory for Git global config by running `git
    # config --global --add safe.directory <path>`
    # Default: true
    set-safe-directory: ''

    # The base URL for the GitHub instance that you are trying to clone from, will use
    # environment defaults to fetch from the same instance that the workflow is
    # running from unless specified. Example URLs are https://github.com or
    # https://my-ghes-server.example.com
    github-server-url: ''

    # Required to check out fork pull request code from a workflow triggered by
    # `pull_request_target` or `workflow_run`. These workflows run with the base
    # repository's GITHUB_TOKEN, secrets, default-branch cache scope, and runner
    # access; fetching and executing a fork's code in that trusted context commonly
    # leads to "pwn request" vulnerabilities. Set to `true` only after reviewing the
    # risks at https://gh.io/securely-using-pull_request_target.
    # Default: false
    allow-unsafe-pr-checkout: ''
```
<!-- end usage -->

# Scenarios

- [Checkout V5](#checkout-v5)
  - [What's new](#whats-new)
- [Checkout V4](#checkout-v4)
    - [Note](#note)
- [What's new](#whats-new-1)
- [Usage](#usage)
- [Scenarios](#scenarios)
  - [Fetch only the root files](#fetch-only-the-root-files)
  - [Fetch only the root files and `.github` and `src` folder](#fetch-only-the-root-files-and-github-and-src-folder)
  - [Fetch only a single file](#fetch-only-a-single-file)
  - [Fetch all history for all tags and branches](#fetch-all-history-for-all-tags-and-branches)
  - [Checkout a different branch](#checkout-a-different-branch)
  - [Checkout HEAD^](#checkout-head)
  - [Checkout multiple repos (side by side)](#checkout-multiple-repos-side-by-side)
  - [Checkout multiple repos (nested)](#checkout-multiple-repos-nested)
  - [Checkout multiple repos (private)](#checkout-multiple-repos-private)
  - [Checkout pull request HEAD commit instead of merge commit](#checkout-pull-request-head-commit-instead-of-merge-commit)
  - [Checkout pull request on closed event](#checkout-pull-request-on-closed-event)
  - [Push a commit using the built-in token](#push-a-commit-using-the-built-in-token)
  - [Push a commit to a PR using the built-in token](#push-a-commit-to-a-pr-using-the-built-in-token)
- [Recommended permissions](#recommended-permissions)
- [License](#license)

## Fetch only the root files

```yaml
- uses: bhouston/checkout-git-dedup@main
  with:
    sparse-checkout: .
```

## Fetch only the root files and `.github` and `src` folder

```yaml
- uses: bhouston/checkout-git-dedup@main
  with:
    sparse-checkout: |
      .github
      src
```

## Fetch only a single file

```yaml
- uses: bhouston/checkout-git-dedup@main
  with:
    sparse-checkout: |
      README.md
    sparse-checkout-cone-mode: false
```

## Fetch all history for all tags and branches

```yaml
- uses: bhouston/checkout-git-dedup@main
  with:
    fetch-depth: 0
```

## Checkout a different branch

```yaml
- uses: bhouston/checkout-git-dedup@main
  with:
    ref: my-branch
```

## Checkout HEAD^

```yaml
- uses: bhouston/checkout-git-dedup@main
  with:
    fetch-depth: 2
- run: git checkout HEAD^
```

## Checkout multiple repos (side by side)

```yaml
- name: Checkout
  uses: bhouston/checkout-git-dedup@main
  with:
    path: main

- name: Checkout tools repo
  uses: bhouston/checkout-git-dedup@main
  with:
    repository: my-org/my-tools
    path: my-tools
```
> - If your secondary repository is private or internal you will need to add the option noted in [Checkout multiple repos (private)](#Checkout-multiple-repos-private)

## Checkout multiple repos (nested)

```yaml
- name: Checkout
  uses: bhouston/checkout-git-dedup@main

- name: Checkout tools repo
  uses: bhouston/checkout-git-dedup@main
  with:
    repository: my-org/my-tools
    path: my-tools
```
> - If your secondary repository is private or internal you will need to add the option noted in [Checkout multiple repos (private)](#Checkout-multiple-repos-private)

## Checkout multiple repos (private)

```yaml
- name: Checkout
  uses: bhouston/checkout-git-dedup@main
  with:
    path: main

- name: Checkout private tools
  uses: bhouston/checkout-git-dedup@main
  with:
    repository: my-org/my-private-tools
    token: ${{ secrets.GH_PAT }} # `GH_PAT` is a secret that contains your PAT
    path: my-tools
```

> - `${{ github.token }}` is scoped to the current repository, so if you want to checkout a different repository that is private you will need to provide your own [PAT](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line).


## Checkout pull request HEAD commit instead of merge commit

```yaml
- uses: bhouston/checkout-git-dedup@main
  with:
    ref: ${{ github.event.pull_request.head.sha }}
```

## Checkout pull request on closed event

```yaml
on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, closed]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: bhouston/checkout-git-dedup@main
```

## Push a commit using the built-in token

```yaml
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: bhouston/checkout-git-dedup@main
      - run: |
          date > generated.txt
          # Note: the following account information will not work on GHES
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add .
          git commit -m "generated"
          git push
```
*NOTE:* The user email is `{user.id}+{user.login}@users.noreply.github.com`. See users API: https://api.github.com/users/github-actions%5Bbot%5D

## Push a commit to a PR using the built-in token

In a pull request trigger, `ref` is required as GitHub Actions checks out in detached HEAD mode, meaning it doesn’t check out your branch by default.

```yaml
on: pull_request
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: bhouston/checkout-git-dedup@main
        with:
          ref: ${{ github.head_ref }}
      - run: |
          date > generated.txt
          # Note: the following account information will not work on GHES
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add .
          git commit -m "generated"
          git push
```

*NOTE:* The user email is `{user.id}+{user.login}@users.noreply.github.com`. See users API: https://api.github.com/users/github-actions%5Bbot%5D

# Recommended permissions

When using the `checkout` action in your GitHub Actions workflow, it is recommended to set the following `GITHUB_TOKEN` permissions to ensure proper functionality, unless alternative auth is provided via the `token` or `ssh-key` inputs:

```yaml
permissions:
  contents: read
```

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
