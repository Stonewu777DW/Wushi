// Refreshes the signed-in user's Yahoo teams (record, rank, points).
import { requireUser, syncTeams } from '../_shared/yahoo.ts';

Deno.serve(async (req) => {
  try {
    return Response.json(await syncTeams(await requireUser(req)));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
