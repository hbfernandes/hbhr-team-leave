import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function pngSize(file: string): [number, number] {
  const bytes = readFileSync(path.resolve(file));
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe('Chrome Web Store submission assets', () => {
  it('ships every declared icon at its exact PNG dimensions', () => {
    const manifest = JSON.parse(readFileSync(path.resolve('public/manifest.json'), 'utf8'));
    expect(Object.keys(manifest.icons)).toEqual(['16', '32', '48', '128']);
    for (const size of [16, 32, 48, 128]) {
      expect(pngSize(`public/${manifest.icons[String(size)]}`)).toEqual([size, size]);
    }
    expect(manifest.permissions).toEqual(['storage']);
  });

  it('provides correctly sized promotional art and listing screenshots', () => {
    expect(pngSize('store-assets/promo-440x280.png')).toEqual([440, 280]);
    expect(pngSize('store-assets/screenshot-calendar-1280x800.png')).toEqual([1280, 800]);
    expect(pngSize('store-assets/screenshot-team-editor-1280x800.png')).toEqual([1280, 800]);
  });

  it('provides a self-contained policy without tracking or remote page assets', () => {
    const policy = readFileSync(path.resolve('store-assets/privacy.html'), 'utf8');
    expect(policy).toContain('HBHR Team Leave Privacy Policy');
    expect(policy).toContain('Exports are not anonymous');
    expect(policy).toContain('Chrome\'s local extension storage');
    expect(policy).not.toMatch(/<script|<iframe|<img|<link/i);
  });
});