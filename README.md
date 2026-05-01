# Gym Management & Attendance System

Full-stack gym management system with:

- Firebase Authentication for Admin and Member login
- Cloud Firestore as the primary database
- Firebase Cloud Messaging for announcements and membership expiry alerts
- Firebase Hosting support for the frontend
- A separate Node.js/Express backend that owns business logic, attendance processing, QR validation, and role enforcement

## Project Structure

```text
.
|-- backend
|-- frontend
|-- firebase.json
|-- firestore.indexes.json
|-- firestore.rules
```

## Core Architecture

- `frontend`: React/Vite web app for both Admin and Member roles
- `backend`: Express API using Firebase Admin SDK
- `Firestore`: stores members, admins, attendance, and payments
- `FCM`: stores device tokens and sends web push notifications through the backend

## Firestore Collections

### `members/{uid}`

```json
{
  "id": "firebase-auth-uid",
  "name": "Jane Member",
  "email": "jane@example.com",
  "membership_plan": "Premium",
  "membership_start_date": "2026-04-01",
  "membership_end_date": "2026-05-01",
  "payment_status": "paid",
  "qr_token": "secure-random-token",
  "device_tokens": ["fcm-token"],
  "created_at": "2026-04-20T10:00:00.000Z",
  "updated_at": "2026-04-20T10:00:00.000Z"
}
```

### `admins/{uid}`

```json
{
  "id": "firebase-auth-uid",
  "email": "admin@example.com",
  "role": "admin",
  "name": "Gym Admin",
  "device_tokens": ["fcm-token"],
  "created_at": "2026-04-20T10:00:00.000Z"
}
```

### `attendance/{attendanceId}`

```json
{
  "id": "auto-generated-id",
  "member_id": "firebase-auth-uid",
  "member_name": "Jane Member",
  "check_in_time": "2026-04-20T10:00:00.000Z",
  "check_out_time": "2026-04-20T12:00:00.000Z",
  "last_action_time": "2026-04-20T12:00:00.000Z",
  "date": "2026-04-20",
  "status": "completed"
}
```

### `payments/{paymentId}`

```json
{
  "id": "payment-id",
  "member_id": "firebase-auth-uid",
  "amount": 49.99,
  "status": "paid",
  "date": "2026-04-20"
}
```

## Authentication Flow

1. User signs in with Firebase Authentication in the frontend.
2. Frontend gets the Firebase ID token.
3. Frontend sends the ID token as `Authorization: Bearer <token>` to the backend.
4. Backend verifies the token using Firebase Admin SDK.
5. Backend resolves the user role from Firestore:
   - `admins/{uid}` => Admin
   - `members/{uid}` => Member

## Attendance Flow

1. Member logs in.
2. Member scans a QR code containing their assigned `qr_token`, or pastes the token manually.
3. Frontend calls `POST /attendance/scan`.
4. Backend verifies:
   - Firebase ID token
   - matching member `qr_token`
   - membership validity
   - single active session rule
   - duplicate scan cooldown
5. Backend creates a check-in or check-out record in Firestore.

## Setup

### 1. Install dependencies

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
```

### 2. Configure backend environment

Copy `backend/.env.example` to `backend/.env` and fill in Firebase Admin SDK values.

### 3. Configure frontend environment

Copy `frontend/.env.example` to `frontend/.env` and fill in Firebase web app config plus your backend base URL.

### 4. Seed your first admin

Create a Firebase Auth user manually, then add the matching Firestore document:

```json
{
  "id": "<admin-uid>",
  "email": "admin@example.com",
  "role": "admin",
  "name": "Main Admin",
  "device_tokens": [],
  "created_at": "2026-04-20T10:00:00.000Z"
}
```

### 5. Run locally

```bash
npm run dev:backend
npm run dev:frontend
```

### 6. Deploy Firebase resources

```bash
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

## API Summary

- `GET /health`
- `GET /auth/me`
- `GET /members`
- `POST /members`
- `PUT /members/:id`
- `DELETE /members/:id`
- `GET /members/:id`
- `GET /members/me`
- `POST /attendance/scan`
- `GET /attendance`
- `GET /attendance/:memberId`
- `GET /dashboard/stats`
- `POST /notifications/register-token`
- `POST /notifications/announcements`
- `POST /notifications/expiry-alerts/dispatch`

## Notes

- All attendance timestamps are stored as UTC ISO strings.
- Direct client writes to sensitive collections are blocked in Firestore rules.
- Attendance logic lives only in the backend.
- FCM token storage and outbound notifications are routed through the backend.

