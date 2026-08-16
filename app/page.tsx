import Link from "next/link";
import AuthNav from "./AuthNav";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.hero}>
      <AuthNav />
      <div className={styles.badge}>AI Travel Planning</div>
      <h1 className={styles.headline}>
        A plan that survives reality.
      </h1>
      <p className={styles.sub}>
        Geography-aware, weather-aware itineraries with real open restaurants
        and a backup in every slot — generated in one pass.
      </p>
      <Link href="/planner" className={styles.cta}>
        Plan my trip →
      </Link>

      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.icon}>🗺️</span>
          <h3>Geographically clustered</h3>
          <p>Days grouped so you never cross the city twice.</p>
        </div>
        <div className={styles.card}>
          <span className={styles.icon}>🌦️</span>
          <h3>Weather-aware</h3>
          <p>Indoor alternatives auto-surfaced on bad-weather days.</p>
        </div>
        <div className={styles.card}>
          <span className={styles.icon}>🔄</span>
          <h3>Backup in every slot</h3>
          <p>One tap to swap any activity or restaurant.</p>
        </div>
        <div className={styles.card}>
          <span className={styles.icon}>💡</span>
          <h3>Explained reasoning</h3>
          <p>Every choice shows why — weather, location, your interests.</p>
        </div>
      </div>
    </main>
  );
}
