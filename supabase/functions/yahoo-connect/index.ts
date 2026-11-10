// Starts linking: the app sends where to return to and gets back the Yahoo sign-in URL.
import { admin, authorizeUrl, requireUser } from '../_shared/yahoo.ts';

Deno.serve(async (req) => {
  try {
    const userId = await requireUser(req);
    const { returnUrl } = await req.json();
    // Only send users back into the app (wushi:// in builds, exp:// in Expo Go).
    if (!/^(wushi|exps?):\/\//.test(returnUrl)) throw new Error('Invalid return URL');
    const state = crypto.randomUUID();
    const { error } = await admin.from('yahoo_oauth_states').insert({ state, user_id: userId, return_url: returnUrl });
    if (error) throw error;
    return Response.json({ url: authorizeUrl(state) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
