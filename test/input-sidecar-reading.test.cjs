const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { inputSidecarLimits, readInputSidecar } = require('../electron/projects/input-sidecar.cjs');
const { createProjectFeatureDetector } = require('../electron/projects/project-feature-detection.cjs');
const {
  caretAutomationUnavailableEvent,
  caretEvent,
  caretLimitReachedEvent,
  keystrokeEvent,
  mouseButtonEvent,
  shortcutEvent,
  sidecarVersion2,
  smallLimits,
} = require('./input-sidecar-fixtures.cjs');

const repositoryRoot = path.join(__dirname, '..');

const temporaryDirectory = (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-input-sidecar-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};

const writeSidecar = (directory, contents) => {
  const file = path.join(directory, 'input.json');
  fs.writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents));
  return file;
};

test('the limits Electron enforces are the shared contract file, unchanged', () => {
  const contract = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'packages/capture/contracts/input-sidecar-limits.json'), 'utf8'),
  );
  assert.deepEqual(inputSidecarLimits, contract);
});

test('the packaged application includes the contract file Electron loads', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.ok(packageJson.build.files.includes('packages/capture/contracts/**/*'));
});

test('an absent sidecar is reported as absent, not as a failure', (t) => {
  const directory = temporaryDirectory(t);
  assert.deepEqual(readInputSidecar(path.join(directory, 'input.json')), { status: 'absent' });
});

test('a valid sidecar is read and normalised', (t) => {
  const file = writeSidecar(temporaryDirectory(t), sidecarVersion2([keystrokeEvent(1)]));
  assert.deepEqual(readInputSidecar(file), { status: 'read', sidecar: sidecarVersion2([keystrokeEvent(1)]) });
});

test('an oversized sidecar is refused on its size before it is parsed', (t) => {
  // Not JSON at all: if the file were read and parsed first, the refusal would say invalid.
  const file = writeSidecar(temporaryDirectory(t), 'x'.repeat(smallLimits.maximumSidecarBytes + 1));
  assert.deepEqual(readInputSidecar(file, smallLimits), {
    status: 'refused',
    reason: 'too-large',
    byteLength: smallLimits.maximumSidecarBytes + 1,
  });
});

test('a sidecar exactly at the size limit is not refused for its size', (t) => {
  const events = JSON.stringify(sidecarVersion2([]));
  const file = writeSidecar(
    temporaryDirectory(t),
    events + ' '.repeat(smallLimits.maximumSidecarBytes - events.length),
  );
  assert.equal(readInputSidecar(file, smallLimits).status, 'read');
});

test('a sidecar with too many events is refused with that reason', (t) => {
  const file = writeSidecar(
    temporaryDirectory(t),
    sidecarVersion2([keystrokeEvent(0), keystrokeEvent(1), keystrokeEvent(2), keystrokeEvent(3)]),
  );
  const result = readInputSidecar(file, smallLimits);
  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'too-many-events');
});

test('a malformed or invalid sidecar is refused as invalid, with its length', (t) => {
  const directory = temporaryDirectory(t);
  for (const contents of ['{ not json', JSON.stringify({ version: 9, events: [] })]) {
    const file = writeSidecar(directory, contents);
    assert.deepEqual(readInputSidecar(file), {
      status: 'refused',
      reason: 'invalid',
      byteLength: Buffer.byteLength(contents),
    });
  }
});

const createDetector = () =>
  createProjectFeatureDetector({
    safePath: (base, relative) => (relative ? path.join(base, relative) : null),
    sessionFileFor: (directory, sessionId, relative) => path.join(directory, 'sessions', sessionId, relative),
  });

const captionFeatureWith = (t, sidecarContents) => {
  const projectDirectory = temporaryDirectory(t);
  const cursorDirectory = path.join(projectDirectory, 'sessions', 'session-1', 'cursor');
  fs.mkdirSync(cursorDirectory, { recursive: true });
  writeSidecar(cursorDirectory, sidecarContents);
  const manifest = { editor: { composition: { keyboardCaptionSessions: ['session-1'] } } };
  return createDetector()(projectDirectory, manifest, []).hasCaption;
};

test('typing alone does not count as keyboard caption content', (t) => {
  assert.equal(captionFeatureWith(t, sidecarVersion2([keystrokeEvent(0), keystrokeEvent(1)])), false);
});

test('shortcuts and clicks still count as keyboard caption content, as before', (t) => {
  assert.equal(captionFeatureWith(t, sidecarVersion2([keystrokeEvent(0), shortcutEvent(1)])), true);
  assert.equal(captionFeatureWith(t, { version: 1, events: [mouseButtonEvent(0)] }), true);
});

const { sessionInteractionsFrom } = require('../electron/projects/input-sidecar.cjs');

const reportCollector = () => {
  const reports = [];
  return { reports, reportRefusal: (message) => reports.push(message) };
};

test('a session without a sidecar has empty interactions and reports nothing', (t) => {
  const { reports, reportRefusal } = reportCollector();
  const result = sessionInteractionsFrom(path.join(temporaryDirectory(t), 'input.json'), 'session-1', reportRefusal);
  assert.deepEqual(result, { interactions: { version: 1, events: [] } });
  assert.deepEqual(reports, []);
});

test('a session with a valid sidecar has its interactions and reports nothing', (t) => {
  const { reports, reportRefusal } = reportCollector();
  const file = writeSidecar(temporaryDirectory(t), sidecarVersion2([keystrokeEvent(3)]));
  assert.deepEqual(sessionInteractionsFrom(file, 'session-1', reportRefusal), {
    interactions: sidecarVersion2([keystrokeEvent(3)]),
  });
  assert.deepEqual(reports, []);
});

test('a refused sidecar is reported once by reason and size, never by content', (t) => {
  const { reports, reportRefusal } = reportCollector();
  const contents = JSON.stringify({ version: 2, events: [{ ...keystrokeEvent(0), key: 'secret-marker' }] });
  const file = writeSidecar(temporaryDirectory(t), contents);

  const result = sessionInteractionsFrom(file, 'session-1', reportRefusal);

  assert.deepEqual(result, { interactions: { version: 1, events: [] }, interactionsRefusedReason: 'invalid' });
  assert.equal(reports.length, 1);
  assert.match(reports[0], /session-1/);
  assert.match(reports[0], /invalid/);
  assert.match(reports[0], new RegExp(`${Buffer.byteLength(contents)} bytes`));
  assert.doesNotMatch(reports[0], /secret-marker/);
});

test('a caret track alone does not count as keyboard caption content', (t) => {
  assert.equal(
    captionFeatureWith(
      t,
      sidecarVersion2([caretAutomationUnavailableEvent(0), caretEvent(1), caretLimitReachedEvent(2)]),
    ),
    false,
  );
});
