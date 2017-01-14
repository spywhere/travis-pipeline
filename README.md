## Travis Pipeline

A simple build pipeline system for GitHub and Travis CI integration

Development Status: Alpha (**NOT** recommended for production use)

## Setup

1. Install the package using

```
npm install -g travis-pipeline
```

2. Create a `.pipeline.yml` file with the content...

```yml
trigger:
  any:
  - github-username/repository-name
```

3. Add `travis-pipeline` to `after_success` section in `.travis.yml` file...

```yml
after_success:
- travis-pipeline success
```

4. Check the full documentation here
