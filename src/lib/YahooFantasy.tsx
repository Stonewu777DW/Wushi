import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Text } from './Text';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import type { FantasyTeam } from './types';
import { ui } from './ui';

export const record = (t: FantasyTeam) => `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ''}`;

/** Profile section: link a Yahoo account and show the user's fantasy teams. */
export function YahooFantasy({ userId }: { userId: string }) {
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(() => {
    supabase.from('fantasy_teams').select('*').eq('user_id', userId).then(({ data }) => setTeams(data ?? []));
  }, [userId]);
  useEffect(load, [load]);

  async function link() {
    setStatus(null);
    const returnUrl = Linking.createURL('yahoo-linked');
    const { data, error } = await supabase.functions.invoke<{ url: string }>('yahoo-connect', { body: { returnUrl } });
    if (error || !data) return setStatus(error?.message ?? 'Could not start Yahoo sign-in');
    const result = await WebBrowser.openAuthSessionAsync(data.url, returnUrl);
    if (result.type === 'success') setStatus(Linking.parse(result.url).queryParams?.error as string | undefined ?? null);
    load();
  }

  async function refresh() {
    setStatus('Refreshing…');
    const { error } = await supabase.functions.invoke('yahoo-sync');
    setStatus(error ? error.message : null);
    load();
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontWeight: '600' }}>Yahoo Fantasy</Text>
      {teams.map((t) => (
        <View key={t.team_key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {t.logo_url && <Image source={{ uri: t.logo_url }} style={{ width: 36, height: 36, borderRadius: 6 }} />}
          <View>
            <Text>{t.team_name}</Text>
            <Text style={ui.muted}>
              {t.league_name} · {record(t)}{t.rank ? ` · #${t.rank}` : ''} · {t.points_for} pts
            </Text>
          </View>
        </View>
      ))}
      <Pressable onPress={teams.length ? refresh : link}>
        <Text style={ui.link}>{teams.length ? 'Refresh teams' : 'Link Yahoo Fantasy team'}</Text>
      </Pressable>
      {status && <Text style={ui.muted}>{status}</Text>}
    </View>
  );
}
