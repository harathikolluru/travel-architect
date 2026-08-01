import Link from "next/link";
import styles from "./itinerary.module.css";

export default function ItineraryPage() {
  return (
    <main className={styles.wrap}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.logo}>✈️ Travel Architect</Link>
        <div className={styles.trip}>
          <span className={styles.dest}>Lisbon, Portugal</span>
          <span className={styles.dates}>Sep 12 – Sep 14, 2026</span>
        </div>
        <Link href="/planner" className={styles.newTrip}>+ New trip</Link>
      </header>

      <div className={styles.weatherBanner}>
        🌤️ <strong>Day 1–2:</strong> Sunny, 24°C &nbsp;·&nbsp; <strong>Day 3:</strong> Light rain — indoor alternatives ready
      </div>

      <div className={styles.layout}>
        <aside className={styles.panel}>
          <p className={styles.comingSoon}>
            🚧 Itinerary coming soon — connect the planning agent to see your real trip here.
          </p>
          <div className={styles.dayCard}>
            <div className={styles.dayHeader} style={{ borderLeft: "4px solid #2563eb" }}>
              Day 1 · Sep 12 &nbsp;<span className={styles.hood}>Alfama + Baixa</span>
            </div>
            <div className={styles.slot}>
              <span className={styles.time}>10:00</span>
              <span className={styles.icon}>🏛️</span>
              <div>
                <div className={styles.slotName}>Castelo de São Jorge</div>
                <div className={styles.rationale}>Morning — beat the crowds; hilltop view anchors the day</div>
              </div>
            </div>
            <div className={styles.slot}>
              <span className={styles.time}>13:00</span>
              <span className={styles.icon}>🍽️</span>
              <div>
                <div className={styles.slotName}>Tasca do Chico</div>
                <div className={styles.rationale}>5-min walk from castle; pescatarian-friendly; open Tue–Sun</div>
              </div>
            </div>
            <div className={styles.slot}>
              <span className={styles.time}>15:00</span>
              <span className={styles.icon}>🎵</span>
              <div>
                <div className={styles.slotName}>Fado Museum</div>
                <div className={styles.rationale}>Same neighbourhood; indoor — good afternoon anchor</div>
              </div>
            </div>
          </div>

          <div className={styles.packingList}>
            <h3>🎒 Packing list</h3>
            <ul>
              <li>☂️ Umbrella — rain forecast Day 3</li>
              <li>👟 Walking shoes — 8–10km/day</li>
              <li>🧴 Sunscreen — highs up to 26°C</li>
            </ul>
          </div>
        </aside>

        <div className={styles.mapPlaceholder}>
          <div className={styles.mapLabel}>
            🗺️ Interactive map will render here
            <span>Leaflet.js · stops plotted by day · Day 1 blue · Day 2 orange · Day 3 green</span>
          </div>
        </div>
      </div>
    </main>
  );
}
