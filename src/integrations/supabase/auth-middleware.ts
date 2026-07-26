import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { supabase } from './client'
import { checkBypassToken } from 'auth-bypass'

export const requireSupabaseAuth = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    let { data } = await supabase.auth.getSession();

    const expiresAt = data.session?.expires_at;
    const isExpiringSoon = expiresAt && expiresAt * 1000 < Date.now() + 60_000; // within 60s

    if (isExpiringSoon) {
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed.session) data = refreshed;
      } catch (err) {
        console.error("Proactive refresh failed:", err);
      }
    }

    const token = data.session?.access_token;
    return next({
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
  })
  .server(
    async ({ next }) => {
    
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Response(
        'Missing Supabase environment variables. Ensure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are set.',
        { status: 500 }
      );
    }
    
    const request = getRequest();

    if (!request?.headers) {
      throw new Response('Unauthorized: No request headers available', { status: 401 });
    }

    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      throw new Response('Unauthorized: No authorization header provided', { status: 401 });
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new Response('Unauthorized: Only Bearer tokens are supported', { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      throw new Response('Unauthorized: No token provided', { status: 401 });
    }

    const supabase = createClient<Database>(
      SUPABASE_URL!,
      SUPABASE_PUBLISHABLE_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    let userId: string;
    let claims: any;

    const bypass = (process.env.E2E_AUTH_BYPASS === '1' && token === 'mock-access-token')
      ? checkBypassToken(token)
      : null;
    if (bypass) {
      userId = bypass.userId;
      claims = bypass.claims;
    } else {
      const { data, error } = await supabase.auth.getClaims(token);
      if (error || !data?.claims) {
        throw new Response('Unauthorized: Invalid token', { status: 401 });
      }

      if (!data.claims.sub) {
        throw new Response('Unauthorized: No user ID found in token', { status: 401 });
      }
      userId = data.claims.sub;
      claims = data.claims;
    }

    return next({
      context: {
        supabase,
        userId,
        claims,
      },
    })
  }
)
