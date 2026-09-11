import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import { MediaServerType } from '@server/constants/server';
import ImageProxy from '@server/lib/imageproxy';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import request from 'supertest';
import avatarRoutes from './avatarproxy';

let app: Express;

function createApp() {
  const app = express();
  app.use('/avatarproxy', avatarRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res
        .status(err.status ?? 500)
        .json({ status: err.status ?? 500, message: err.message });
    }
  );
  return app;
}

before(() => {
  app = createApp();
});

beforeEach(() => {
  getSettings().main.mediaServerType = MediaServerType.JELLYFIN;
});

afterEach(() => {
  mock.restoreAll();
});

setupTestDb();

describe('GET /avatarproxy/:jellyfinUserId', () => {
  it('returns 400 instead of hanging for a malformed Jellyfin user id', async () => {
    const res = await request(app).get('/avatarproxy/invalid');

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /not a Jellyfin avatar/i);
  });

  it('returns 500 instead of hanging when avatar image loading fails', async () => {
    mock.method(ImageProxy.prototype, 'getImage', async () => {
      throw new Error('upstream image unavailable');
    });

    const res = await request(app).get(
      '/avatarproxy/00000000000000000000000000000000'
    );

    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.message, 'Failed to proxy avatar image.');
  });
});
