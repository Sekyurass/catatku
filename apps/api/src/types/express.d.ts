declare global {
  namespace Express {
    interface Request {
      /** Diisi oleh middleware requireAuth. */
      userId?: string;
    }
  }
}

export {};
