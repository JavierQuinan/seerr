import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import TheMovieDb from '@server/api/themoviedb';
import type { TmdbMovieDetails } from '@server/api/themoviedb/interfaces';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { setupTestDb } from '@server/test/db';

setupTestDb();

const orphanedUserId = 999999;

function fakeTmdbMovie(tmdbId: number): TmdbMovieDetails {
  return {
    id: tmdbId,
    genres: [],
    original_language: 'en',
    keywords: { keywords: [] },
    external_ids: {},
  } as unknown as TmdbMovieDetails;
}

describe('MediaRequest orphaned requester handling', () => {
  it('does not crash when checking an existing auto-request whose requester is missing', async (t) => {
    const userRepo = getRepository(User);
    const mediaRepo = getRepository(Media);
    const requestRepo = getRepository(MediaRequest);

    const requestUser = await userRepo.findOneOrFail({
      where: { email: 'friend@seerr.dev' },
    });

    const media = await mediaRepo.save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 24680,
        status: MediaStatus.DELETED,
        status4k: MediaStatus.UNKNOWN,
      })
    );

    const historicalRequest = await requestRepo.save(
      new MediaRequest({
        type: MediaType.MOVIE,
        status: MediaRequestStatus.COMPLETED,
        media,
        requestedBy: requestUser,
        is4k: false,
        isAutoRequest: true,
      })
    );

    await requestRepo.query('PRAGMA foreign_keys = OFF');
    try {
      await requestRepo.query(
        'UPDATE media_request SET requestedById = ? WHERE id = ?',
        [orphanedUserId, historicalRequest.id]
      );
    } finally {
      await requestRepo.query('PRAGMA foreign_keys = ON');
    }

    t.mock.method(TheMovieDb.prototype, 'getMovie', async ({ movieId }) =>
      fakeTmdbMovie(movieId)
    );

    const created = await MediaRequest.request(
      {
        mediaId: media.tmdbId,
        mediaType: MediaType.MOVIE,
        is4k: false,
      },
      requestUser
    );

    assert.strictEqual(created.requestedBy.id, requestUser.id);
    assert.notStrictEqual(created.id, historicalRequest.id);
  });
});
