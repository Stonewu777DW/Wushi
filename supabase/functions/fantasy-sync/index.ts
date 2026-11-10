// Refreshes fantasy matchups, lines and scores for the signed-in user's leagues and settles finished bets.
import { requireUser, syncMatchups } from '../_shared/yahoo.ts';

Deno.serve(async (req) => {
  try {
    return Response.json(await syncMatchups(await requireUser(req)));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
