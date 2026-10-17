import { routeHref } from '../utils/base';

export default function Profile() {
  return `
    <div class="card">
      <h2>Dein Profil</h2>
      <p>Hier werden später Name, Rolle, Kontaktdaten und deine Diensteinrichtungen angezeigt.</p>
      <p><em>Status: Wird noch implementiert 🔧</em></p>
    </div>
    <div class="card">
      <h2>Navigation</h2>
      <a href="${routeHref('/')}" class="link" style="background: var(--ct-color-primary, #2563eb); color: white; display: inline-block; margin-top: 0.75rem;">← Zurück zum Dashboard</a>
    </div>
  `;
}