#!/usr/bin/env node
'use strict';

const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PACKAGE_NAME = '@truenine/croessweave-cli';
const BINARY_NAME = 'tnmsc';
const SUPPORTED_TARGETS = [
  'linux-x64-gnu',
  'linux-arm64-gnu',
  'darwin-x64',
  'darwin-arm64',
  'win32-x64-msvc',
].join(', ');

const PLATFORM_PACKAGES = {
  darwin: {
    arm64: '@truenine/croessweave-cli-darwin-arm64',
    x64: '@truenine/croessweave-cli-darwin-x64',
  },
  linux: {
    arm64: '@truenine/croessweave-cli-linux-arm64-gnu',
    x64: '@truenine/croessweave-cli-linux-x64-gnu',
  },
  win32: {
    x64: '@truenine/croessweave-cli-win32-x64-msvc',
  },
};

function fail(message) {
  console.error(`${PACKAGE_NAME}: ${message}`);
  process.exit(1);
}

function detectLinuxLibc() {
  const report = process.report;
  if (report == null || typeof report.getReport !== 'function') {
    return 'unknown';
  }

  const header = report.getReport()?.header;
  if (header == null || typeof header !== 'object') {
    return 'unknown';
  }

  if (header.glibcVersionRuntime || header.glibcVersionCompiler) {
    return 'glibc';
  }

  return 'unknown';
}

function resolvePlatformPackageName() {
  const archMap = PLATFORM_PACKAGES[process.platform];
  if (archMap == null) {
    fail(
      `Unsupported platform ${process.platform}/${process.arch}. Supported npm targets: ${SUPPORTED_TARGETS}.`,
    );
  }

  const packageName = archMap[process.arch];
  if (packageName == null) {
    fail(
      `Unsupported architecture ${process.platform}/${process.arch}. Supported npm targets: ${SUPPORTED_TARGETS}.`,
    );
  }

  if (process.platform === 'linux' && detectLinuxLibc() !== 'glibc') {
    fail(
      'Linux npm binaries currently require glibc. musl/Alpine environments are not supported by the published packages.',
    );
  }

  return packageName;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`Failed to read ${filePath}: ${error.message}`);
  }
}

function resolveBinaryPath(packageName) {
  let manifestPath;
  try {
    manifestPath = require.resolve(`${packageName}/package.json`);
  } catch (error) {
    fail(
      `Missing optional native package ${packageName}. Reinstall ${PACKAGE_NAME} on a supported platform so npm can fetch the matching binary package. Original error: ${error.message}`,
    );
  }

  const manifest = readJson(manifestPath);
  const packageDir = path.dirname(manifestPath);
  const binField = manifest.bin;
  let relativeBinaryPath;

  if (typeof binField === 'string') {
    relativeBinaryPath = binField;
  } else if (binField != null && typeof binField === 'object') {
    if (typeof binField[BINARY_NAME] === 'string') {
      relativeBinaryPath = binField[BINARY_NAME];
    } else {
      relativeBinaryPath = Object.values(binField).find(value => typeof value === 'string');
    }
  }

  if (typeof relativeBinaryPath !== 'string' || relativeBinaryPath.length === 0) {
    fail(`Package ${packageName} does not declare a ${BINARY_NAME} binary entry.`);
  }

  const binaryPath = path.resolve(packageDir, relativeBinaryPath);
  if (!fs.existsSync(binaryPath)) {
    fail(
      `Native binary ${binaryPath} is missing from ${packageName}. Reinstall ${PACKAGE_NAME} and try again.`,
    );
  }

  return binaryPath;
}

function runNativeBinary(binaryPath) {
  const result = spawnSync(binaryPath, process.argv.slice(2), {
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error != null) {
    fail(`Failed to launch ${binaryPath}: ${result.error.message}`);
  }

  if (typeof result.status === 'number') {
    process.exit(result.status);
  }

  if (result.signal != null) {
    process.kill(process.pid, result.signal);
    return;
  }

  process.exit(1);
}

runNativeBinary(resolveBinaryPath(resolvePlatformPackageName()));
