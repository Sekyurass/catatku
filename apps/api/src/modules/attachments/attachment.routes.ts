import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MIME_TYPES, FEATURE_FLAGS } from '@catatku/shared';
import express, { Router } from 'express';
import { currentUserId } from '../../middleware/auth';
import { requireFeature } from '../features/features.routes';
import * as attachmentService from './attachment.service';

/** Dipasang di /api/v1: /transactions/:id/attachments dan /attachments/:id. */
export function createAttachmentsRouter() {
  const router = Router();
  const gate = requireFeature(FEATURE_FLAGS.ATTACHMENTS);

  router.get('/transactions/:id/attachments', gate, async (req, res) => {
    res.json({
      items: await attachmentService.listAttachments(currentUserId(req), String(req.params.id)),
    });
  });

  router.post(
    '/transactions/:id/attachments',
    gate,
    express.raw({ type: [...ATTACHMENT_MIME_TYPES], limit: ATTACHMENT_MAX_BYTES }),
    async (req, res) => {
      res
        .status(201)
        .json(
          await attachmentService.uploadAttachment(
            currentUserId(req),
            String(req.params.id),
            req.body,
          ),
        );
    },
  );

  router.delete('/attachments/:id', gate, async (req, res) => {
    await attachmentService.deleteAttachment(currentUserId(req), String(req.params.id));
    res.status(204).end();
  });

  return router;
}
