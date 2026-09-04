import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
});

try {
  const { readArtifact } = await server.ssrLoadModule('/app/lib/artifacts.ts');

  /* Captured from the active direct import after the game marked sub 3 as
     converted. The fourth flag remains zero; reading it as the lock silently
     turns this artifact back into an unconverted one. */
  const artifact = readArtifact({
    rid: 284184132, type: 1, attribute: 1, unit_style: 0, natural_rank: 5,
    rank: 5, level: 12, pri_effect: [101, 58, 12, 0, 0],
    sec_effects: [
      [218, 0.2, 0, 0, 0], [219, 14, 3, 0, 0],
      [221, 31, 0, 0, 1], [223, 24, 1, 0, 0],
    ],
    occupied_id: 20772926292, locked: 0, source: 50001,
    extra: [], date_add: '2022-06-27 22:13:04', date_mod: '2022-07-02 19:21:40',
  });

  assert.ok(artifact, 'the captured converted artifact must be readable');
  assert.equal(artifact.convertedPropertyIndex, 2,
    'the fifth tuple field locks conversion to the displayed third sub-property');
  console.log('Converted artifact locks follow the fifth export tuple field.');
} finally {
  await server.close();
}
