import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  privacyConsentSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '@catatku/shared';
import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import * as authService from './auth.service';
import * as avatarService from './avatar.service';

export const REFRESH_COOKIE = 'catatku_rt';

function cookieOptions(expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    path: '/api/v1/auth',
    ...(expires && { expires }),
  };
}

function sendSession(res: Response, session: authService.Session, status = 200) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, cookieOptions(session.refreshExpiresAt));
  res.status(status).json({ user: session.user, accessToken: session.accessToken });
}

const meta = (req: Request) => ({ userAgent: req.get('user-agent') });

export async function register(req: Request, res: Response) {
  const input = parse(registerSchema, req.body);
  sendSession(res, await authService.register(input, meta(req)), 201);
}

export async function login(req: Request, res: Response) {
  const input = parse(loginSchema, req.body);
  sendSession(res, await authService.login(input, meta(req)));
}

export async function refresh(req: Request, res: Response) {
  try {
    sendSession(res, await authService.refresh(req.cookies?.[REFRESH_COOKIE], meta(req)));
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    throw err;
  }
}

export async function me(req: Request, res: Response) {
  res.json({ user: await authService.getProfile(currentUserId(req)) });
}

export async function updateProfile(req: Request, res: Response) {
  const input = parse(updateProfileSchema, req.body);
  res.json({ user: await authService.updateProfile(currentUserId(req), input) });
}

export async function agreePrivacy(req: Request, res: Response) {
  const input = parse(privacyConsentSchema, req.body);
  res.json({ user: await authService.agreePrivacy(currentUserId(req), input) });
}

export async function changePassword(req: Request, res: Response) {
  const input = parse(changePasswordSchema, req.body);
  sendSession(res, await authService.changePassword(currentUserId(req), input, meta(req)));
}

export async function putAvatar(req: Request, res: Response) {
  res.json({ user: await avatarService.setAvatar(currentUserId(req), req.body) });
}

/** Klien selalu meminta dengan `?v=<avatarUpdatedAt>`, jadi respons aman di-cache lama. */
export async function getAvatar(req: Request, res: Response) {
  const avatar = await avatarService.getAvatar(currentUserId(req));
  res.set({
    'Content-Type': avatar.mimeType,
    'Cache-Control': 'private, max-age=31536000, immutable',
  });
  res.send(Buffer.from(avatar.data));
}

export async function deleteAvatar(req: Request, res: Response) {
  res.json({ user: await avatarService.removeAvatar(currentUserId(req)) });
}

export async function forgotPassword(req: Request, res: Response) {
  await authService.requestPasswordReset(parse(forgotPasswordSchema, req.body));
  res.status(204).end();
}

export async function resetPassword(req: Request, res: Response) {
  const input = parse(resetPasswordSchema, req.body);
  sendSession(res, await authService.resetPassword(input, meta(req)));
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
  res.status(204).end();
}
