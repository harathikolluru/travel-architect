import Link from 'next/link';
import AuthNav from '../AuthNav';
import PlannerForm from './PlannerForm';
import styles from './planner.module.css';

export default function PlannerPage() {
  return (
    <main className={styles.wrap}>
      <AuthNav />
      <div className={styles.card}>
        <Link href="/" className={styles.back}>← Back</Link>
        <h1 className={styles.title}>Plan your trip</h1>
        <p className={styles.sub}>Tell us where you&apos;re going and we&apos;ll handle the rest.</p>
        <PlannerForm />
      </div>
    </main>
  );
}
