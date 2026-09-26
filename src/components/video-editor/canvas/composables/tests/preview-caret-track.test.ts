import { describe, expect, it } from 'vitest';
import type { InputEventSidecar } from '~/api/types/capture-session';
import { createCaretTrackReader } from '../preview-caret-track';

const sidecar = (sessionNs: number): InputEventSidecar => ({
  version: 2,
  events: [{ event: 'caret', sessionNs, normalizedX: 0.5, normalizedY: 0.5 }],
});

describe('createCaretTrackReader', () => {
  it('has an empty track for a session without interactions', () => {
    expect(createCaretTrackReader()(undefined)).toEqual([]);
  });

  it('returns the same track for the same interactions, so the camera is not rebuilt', () => {
    const readCaretTrack = createCaretTrackReader();
    const interactions = sidecar(1_000_000);
    const first = readCaretTrack(interactions);
    expect(readCaretTrack(interactions)).toBe(first);
    expect(first).toEqual([{ timeMs: 1, cx: 0.5, cy: 0.5 }]);
  });

  it('reads again when the interactions change', () => {
    const readCaretTrack = createCaretTrackReader();
    const first = readCaretTrack(sidecar(1_000_000));
    const second = readCaretTrack(sidecar(2_000_000));
    expect(second).not.toBe(first);
    expect(second).toEqual([{ timeMs: 2, cx: 0.5, cy: 0.5 }]);
  });
});
