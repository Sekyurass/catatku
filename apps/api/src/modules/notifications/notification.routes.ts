import {
  FEATURE_FLAGS,
  listNotificationsQuerySchema,
  pushSubscriptionSchema,
  removePushSubscriptionSchema,
  updateNotificationSettingsSchema,
} from '@catatku/shared';
import { Router } from 'express';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import { requireFeature } from '../features/features.routes';
import * as notifications from './notification.service';

export function createNotificationsRouter() {
  const router = Router();
  router.use(requireFeature(FEATURE_FLAGS.REMINDERS));

  router.get('/', async (req, res) => {
    const query = parse(listNotificationsQuerySchema, req.query);
    res.json(await notifications.listNotifications(currentUserId(req), query));
  });

  router.get('/unread-count', async (req, res) => {
    res.json({ count: await notifications.countUnread(currentUserId(req)) });
  });

  router.post('/read-all', async (req, res) => {
    await notifications.markAllRead(currentUserId(req));
    res.status(204).end();
  });

  router.post('/:id/read', async (req, res) => {
    await notifications.markRead(currentUserId(req), req.params.id);
    res.status(204).end();
  });

  router.get('/settings', async (req, res) => {
    res.json(await notifications.getSettings(currentUserId(req)));
  });

  router.put('/settings', async (req, res) => {
    const input = parse(updateNotificationSettingsSchema, req.body);
    res.json(await notifications.updateSettings(currentUserId(req), input));
  });

  router.post('/push-subscriptions', async (req, res) => {
    const input = parse(pushSubscriptionSchema, req.body);
    await notifications.subscribe(currentUserId(req), input);
    res.status(204).end();
  });

  router.delete('/push-subscriptions', async (req, res) => {
    const { endpoint } = parse(removePushSubscriptionSchema, req.body);
    await notifications.unsubscribe(currentUserId(req), endpoint);
    res.status(204).end();
  });

  router.post('/push-test', async (req, res) => {
    res.json({ sent: await notifications.sendTestPush(currentUserId(req)) });
  });

  return router;
}
