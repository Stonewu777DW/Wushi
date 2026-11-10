// Yahoo redirects here after sign-in. Saves tokens, pulls teams, then hands control back to the app.
import { admin, exchangeCode, syncTeams } from '../_shared/yahoo.ts';

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  const { data: pending } = await admin.from('yahoo_oauth_states').delete().eq('state', params.get('state') ?? '').select().single();
  if (!pending) return new Response('Link expired. Go back to Wushi and try again.', { status: 400 });

  const back = new URL(pending.return_url);
  try {
    const code = params.get('code');
    if (!code) throw new Error(params.get('error_description') ?? 'Yahoo sign-in was cancelled');
    await exchangeCode(pending.user_id, code);
    await syncTeams(pending.user_id);
  } catch (e) {
    back.searchParams.set('error', (e as Error).message);
  }
  return Response.redirect(back.toString(), 302);
});
