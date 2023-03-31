# Nexus covered vaults

### Pre-requirements

The following prerequisites are required:

- [`Node.js`](https://nodejs.org/es/)
- [`Yarn`](https://yarnpkg.com/)

### Install dependencies

Before running any command, make sure to install dependencies:

```sh
$ yarn
```

### Compile contracts

Compile the smart contracts with Hardhat:

```sh
$ yarn compile
```

### Test

Run unit tests:

```sh
$ yarn test
```

### Integration Test

Runs integration tests with Nexus Mutual V2 on a Mainnet fork.

Complete `FORK_URL` in `.env` file

Run tests
```sh
$ yarn test:fork
```

### Coverage

Run unit tests coverage:

```sh
$ yarn coverage
```

### Gas Report

Run unit tests with gas report:

```sh
$ yarn gas-report
```

### Linter

Run typescript and solidity linters:

```sh
$ yarn lint
```
