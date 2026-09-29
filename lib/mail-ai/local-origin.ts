// Nur lokale oder private Adressen fuer KI-Dienste (Analysedienst, Ollama).
// IP-Literale statt Hostnamen verhindern DNS-Rebinding und das versehentliche
// Senden an einen Cloud-Endpunkt. Urspruenglich aus dem Laya-Pilot (lib/local-ai).
export function localOrigin(value: string): string {
  const url = new URL(value);
  const octets = url.hostname.split('.');
  const numbers = octets.map(Number);
  const privateAddress = octets.length === 4 && octets.every(p => /^\d{1,3}$/.test(p)) &&
    numbers.every(n => n >= 0 && n <= 255) &&
    (numbers[0] === 10 || (numbers[0] === 172 && numbers[1] >= 16 && numbers[1] <= 31) ||
      (numbers[0] === 192 && numbers[1] === 168));
  if (!(privateAddress || url.hostname === '127.0.0.1') || !['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Bitte eine private IPv4-Adresse ohne Pfad angeben, z. B. http://127.0.0.1:8766.');
  }
  return url.origin;
}
