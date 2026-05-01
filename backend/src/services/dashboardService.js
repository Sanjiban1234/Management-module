import { db } from "../config/firebaseAdmin.js";
import { daysUntil, getNowUtc, getUtcHour, toUtcDateKey } from "../utils/index.js";

function getPeakHour(attendanceRecords) {
  const hours = attendanceRecords.reduce((accumulator, record) => {
    const hour = getUtcHour(record.check_in_time);
    accumulator[hour] = (accumulator[hour] || 0) + 1;
    return accumulator;
  }, {});

  const entries = Object.entries(hours);
  if (!entries.length) {
    return null;
  }

  const [peakHour, count] = entries.sort((left, right) => right[1] - left[1])[0];
  return {
    hour_utc: Number(peakHour),
    count
  };
}

function getHourlyDistribution(attendanceRecords) {
  const distribution = Array(24).fill(0);
  attendanceRecords.forEach(record => {
    const hour = getUtcHour(record.check_in_time);
    distribution[hour]++;
  });
  return distribution;
}

export async function getDashboardStats() {
  const now = getNowUtc();
  const today = toUtcDateKey(now);
  const nextSevenDays = new Date(now);
  nextSevenDays.setUTCDate(nextSevenDays.getUTCDate() + 7);

  const [
    membersSnapshot,
    plansSnapshot,
    activeAttendanceSnapshot,
    todayAttendanceSnapshot,
    expiringMembersSnapshot
  ] = await Promise.all([
    db.collection("members").get(),
    db.collection("plans").get(),
    db.collection("attendance").where("status", "==", "active").get(),
    db.collection("attendance").where("date", "==", today).get(),
    db
      .collection("members")
      .where("membership_end_date", ">=", today)
      .where("membership_end_date", "<=", nextSevenDays.toISOString().slice(0, 10))
      .get()
  ]);

  const members = membersSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  })).filter((member) => member.archived !== true);

  const plans = plansSnapshot.docs.reduce((acc, doc) => {
    acc[doc.data().name] = doc.data().price;
    return acc;
  }, {});

  const totalRevenue = members.reduce((sum, m) => sum + (Number(plans[m.membership_plan]) || 0), 0);

  const activeMembers = activeAttendanceSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  }));
  const todayAttendance = todayAttendanceSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  }));
  const expiringMembers = expiringMembersSnapshot.docs.map((doc) => ({
    id: doc.id,
    days_until_expiry: daysUntil(doc.data().membership_end_date, now),
    ...doc.data()
  })).filter((member) => member.archived !== true);

  return {
    totals: {
      members: members.length,
      active_members: activeMembers.length,
      today_attendance_count: todayAttendance.length,
      expiring_members: expiringMembers.length,
      estimated_monthly_revenue: totalRevenue
    },
    analytics: {
      peak_hour_today: getPeakHour(todayAttendance),
      hourly_distribution: getHourlyDistribution(todayAttendance)
    },
    active_members: activeMembers,
    expiring_members: expiringMembers.sort(
      (left, right) => left.days_until_expiry - right.days_until_expiry
    )
  };
}

export async function getOccupancy() {
  const snapshot = await db.collection("attendance").where("status", "==", "active").get();
  return { active_members: snapshot.size };
}
