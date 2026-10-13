const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const diaSemana = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
});

export function formatarHora(iso: string): string {
  return hora.format(new Date(iso));
}

/** Recebe "2026-10-07" (data sem hora) e evita o deslocamento de fuso. */
export function formatarDia(data: string): string {
  const texto = diaSemana.format(new Date(`${data}T12:00:00`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function formatarDistancia(metros: number): string {
  return metros < 1000 ? `${metros} m` : `${(metros / 1000).toFixed(1).replace('.', ',')} km`;
}

export function formatarPct(pct: number): string {
  return `${pct.toFixed(0)}%`;
}
