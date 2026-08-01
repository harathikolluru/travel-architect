import Link from "next/link";
import styles from "./planner.module.css";

export default function PlannerPage() {
  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <Link href="/" className={styles.back}>← Back</Link>
        <h1 className={styles.title}>Plan your trip</h1>
        <p className={styles.sub}>Tell us where you&apos;re going and we&apos;ll handle the rest.</p>

        <form className={styles.form} action="/itinerary">
          <div className={styles.field}>
            <label htmlFor="destination">Destination</label>
            <input
              id="destination"
              name="destination"
              type="text"
              placeholder="e.g. Lisbon, Portugal"
              required
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="start">Start date</label>
              <input id="start" name="start" type="date" required />
            </div>
            <div className={styles.field}>
              <label htmlFor="end">End date</label>
              <input id="end" name="end" type="date" required />
            </div>
          </div>

          <div className={styles.field}>
            <label>Pace</label>
            <div className={styles.chips}>
              {["Relaxed", "Moderate", "Packed"].map((p) => (
                <label key={p} className={styles.chip}>
                  <input type="radio" name="pace" value={p.toLowerCase()} defaultChecked={p === "Moderate"} />
                  {p}
                </label>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label>Interests <span className={styles.optional}>(optional)</span></label>
            <div className={styles.chips}>
              {["History", "Food", "Art", "Nature", "Architecture", "Nightlife", "Markets", "Museums"].map((i) => (
                <label key={i} className={styles.chip}>
                  <input type="checkbox" name="interests" value={i.toLowerCase()} />
                  {i}
                </label>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="diet">Dietary preference <span className={styles.optional}>(optional)</span></label>
            <select id="diet" name="diet">
              <option value="">No restriction</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="vegan">Vegan</option>
              <option value="pescatarian">Pescatarian</option>
              <option value="halal">Halal</option>
              <option value="gluten-free">Gluten-free</option>
            </select>
          </div>

          <button type="submit" className={styles.submit}>
            Generate my itinerary →
          </button>
        </form>
      </div>
    </main>
  );
}
