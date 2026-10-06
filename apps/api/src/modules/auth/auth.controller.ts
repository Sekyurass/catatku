import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from '@catatku/shared';
import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import * as authService from './auth.service';

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

export async function changePassword(req: Request, res: Response) {
  const input = parse(changePasswordSchema, req.body);
  sendSession(res, await authService.changePassword(currentUserId(req), input, meta(req)));
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
  res.status(204).end();
}
