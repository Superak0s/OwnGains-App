import React from "react";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";
import LegalScreen, { type LegalSection } from "./components/LegalScreen";

type PrivacyPolicyScreenProps = {
  readonly navigation: NativeStackNavigationProp<
    RootStackParamList,
    "PrivacyPolicy"
  >;
};

const SECTIONS: ReadonlyArray<LegalSection> = [
  {
    title: "Who is responsible",
    body:
      "OwnGains and its official server at owngains.superak0s.com are run by Konstantinos Tsiaros, Anaximenous 20, Thessaloniki, Greece, who is the data controller for everything the app or that server processes about you. If you point the app at a server someone else runs, that person controls the data you sync to it, and this policy then covers only what the app itself does.",
  },
  {
    title: "Data we store",
    body:
      "When you first open OwnGains you choose offline or online mode. In offline mode your workouts, plans, supplements, tracking data, and settings are stored only on your device using local SQLite storage. Nothing about you leaves the device except the crash reports and usage metrics you opt into. GitHub builds also check for updates, and a tip you choose to send goes through Google Play or Ko-fi, all described below. When you choose a server, the app can also look for OwnGains servers on your local Wi-Fi network. That scan does not leave the local network.",
  },
  {
    title: "Online mode and the official server",
    body:
      "If you choose online mode and create an account, your profile, workouts, sets, programs, and friend connections are stored on the server you sign in to, so you can use the app across devices and with friends. By default that is the official server at owngains.superak0s.com. You can instead enter the address of a server you or someone else runs, and whoever operates that server controls the data you sync to it. You can switch back to offline mode at any time, and your device keeps working with local data only.",
  },
  {
    title: "Health and fitness data",
    body:
      "Besides workouts and supplements, you can log body weight, body fat, body measurements, menstrual cycle, injuries, muscle soreness, hydration, macros, personal notes, and progress photos. Some of this, especially menstrual cycle data, is sensitive health information. The official server does not store any of it: tracking data and supplements are kept on your device even in online mode, and Settings lists them under Kept On This Device. A server run by someone else may store them. If it does not, Settings says so in the same place. This data is never shared with friends unless you grant a permission that covers it.",
  },
  {
    title: "Account data",
    body:
      "In online mode the server stores your username, email, password (hashed, never in plain text), and an optional display name to authenticate you, plus sign-in tokens that expire on their own. An optional phone number in your profile stays on this device and is never sent to a server. Failed sign-in attempts are counted against a hashed form of the name you typed, to slow down password guessing, and the count is deleted after a day. Anyone with an account on the same server can find your username by searching for its first few letters. Your display name and workout activity are shared only with people you've added as friends. A friend can see that you are working out, or watch a workout live, only if you have granted them that permission. While anyone is watching, the workout screen shows who, with a button to stop them.",
  },
  {
    title: "Server logs",
    body:
      "To diagnose problems and protect the service, the official server and the proxy in front of it log each request: the time, the address requested (which can include your account’s random identifier), and the IP address it came from, which is always recorded. These logs never contain request or response contents, passwords, or health data, and are deleted after at most 14 days. The server also keeps a short in-memory record of recent failed and slow requests, including your username and IP address, capped to the most recent entries and lost whenever the server restarts.",
  },
  {
    title: "Trainer access",
    body:
      "You can grant a friend Trainer Access from their entry in the Friends tab. A trainer can view your workout history, analytics, notes, and program, watch your workouts live, log workouts for you, and edit your program. They cannot access your account or your tracking or supplement data, and they cannot delete anything. You can revoke the grant at any time from the same place, and blocking the friend revokes it too.",
  },
  {
    title: "Location",
    body:
      "OwnGains does not collect location. The app requests no location permissions and stores no location data. Supplement reminders are scheduled by time of day only.",
  },
  {
    title: "Advertising and data sales",
    body:
      "OwnGains does not show ads, does not sell your data, and does not use third-party advertising trackers.",
  },
  {
    title: "Website visit statistics",
    body:
      "Visits to the official server's web pages, such as this policy and the account-deletion page, are counted by Umami, a statistics tool the developer runs on the same hardware. For each visit it records the page, the referring site, your browser, operating system, device type and language, and the country, region and city worked out from your IP address. It does not store the IP address, sets no cookies, and does not link visits to your account, and requests the app makes to the server are not counted. This rests on the legitimate interest of knowing how the pages are used (Art. 6(1)(f)), and visit records are deleted after a year.",
  },
  {
    title: "Cloudflare",
    body:
      "Connections to the official server and the crash-report server pass through Cloudflare, which protects them from attacks and abuse. To do that Cloudflare decrypts the traffic in transit, so it handles your IP address, device details, and what you send and receive, including sign-in details and synced workouts. It acts only on the developer's instructions, does not keep that content, and keeps its own security logs under its own privacy policy. On the web pages it may set a strictly necessary security cookie that tells people apart from bots.",
  },
  {
    title: "Tips",
    body:
      "Settings → Support Development offers optional one-time tips through Google Play. In app builds downloaded from GitHub instead of Google Play, the same button opens Ko-fi, which processes the tip under its own privacy policy. Google processes the payment under its own privacy policy. The developer receives only Google's order record (order number, item, price, and country), never your payment details. Tips are not linked to your OwnGains account and nothing about them is sent to any OwnGains server.",
  },
  {
    title: "Update checks",
    body:
      "App builds downloaded from GitHub check GitHub for a newer release at most once a day. GitHub sees your IP address with that request, under its own privacy policy. Nothing about you or your account is sent. Google Play builds make no such check.",
  },
  {
    title: "Crash reports and usage metrics",
    body:
      "If you allow crash reporting, crash and error diagnostics (the error message, the stack trace, and basic device and app version details) are sent to the developer's own crash-report server at glitchtip.superak0s.com (a self-hosted GlitchTip, not a third-party service) to help fix bugs. Console and network logs are stripped before sending, so reports do not contain your workout data or password. Reports are tagged with your account's ID on the server (never your username or email) so repeat crashes can be counted, and performance traces record the API paths a request hit, never the request or response contents. The crash-report server sees the IP address a report comes from and records it with the report. Usage metrics (performance traces, counters and diagnostic logs) are off unless you switch them on. They include which screens and features you open, which days you open the app, how long each workout lasted and how many sets and exercises it had, and how many days it has been since your last workout as a range (such as 4 to 7). They never include exercise names, weights, reps, notes or anything else you log. A change to them applies fully from the next app launch. You choose both when you first sign in, and can change them any time under Settings → Privacy and Data. Crash reporting takes effect immediately, including for crashes inside Android itself. Builds made without a crash-report key send nothing at all.",
  },
  {
    title: "Why we process your data",
    body:
      "Your account and synced workouts are processed to provide the online features you signed up for (performance of a contract, GDPR Art. 6(1)(b)). Because workouts and body data can reveal information about your health, storing them on a server also rests on your explicit consent (Art. 9(2)(a)), given when you first sign in. You can withdraw it under Settings → Privacy and Data → Withdraw Health Consent, which deletes your workout history and any body data from the server and switches the app to on-device storage, copying your current plan and its history to this device first, or by deleting your account. Withdrawing does not affect processing that happened before. Crash reports and usage metrics are sent only with your consent (Art. 6(1)(a)), which you can withdraw at any time in Settings. Server logs, the sign-in throttle, and reports about abusive accounts are kept for the legitimate interest of keeping the service secure and working (Art. 6(1)(f)).",
  },
  {
    title: "How long we keep it",
    body:
      "Your account and everything synced to it are kept until you delete the account, then removed immediately from the live database. The official server keeps database backups for up to 30 days, used only to recover from a failure, so deleted data is gone from every copy within 30 days. For 32 days the server keeps only the random identifier of a deleted account, so that restoring a backup cannot bring the account back. Sign-in tokens are deleted once they expire, failed sign-in counts after a day, accounts that never finished sign-up (the consent screen) after 30 days, and server logs after at most 14 days. Crash reports and usage metrics are deleted automatically after 90 days. Reports you file, or that are filed about you, are kept after either account is deleted so the operator can act on repeated abuse. They keep the reported username and the reporter's optional note, but no longer name the reporter. Every report is deleted a year after it was filed.",
  },
  {
    title: "Where your data is stored",
    body:
      "The official server and crash-report server run on the developer's own hardware in Greece, inside the European Union. Your data is not shared with anyone else, apart from these services when you use them, each under its own privacy policy: Cloudflare (United States, under the EU-US Data Privacy Framework and Cloudflare's data processing terms) handles all traffic to both servers. GitHub (United States, under the EU-US Data Privacy Framework) receives update checks from GitHub builds. Google receives Google Play tips and downloads, and email you send the developer, which goes through Gmail. Ko-fi (United Kingdom, covered by an EU adequacy decision) receives tips from GitHub builds.",
  },
  {
    title: "Your rights",
    body:
      "Under the GDPR you can ask for access to your data, correction, deletion, a portable copy, or restriction of processing, object to processing based on legitimate interest, and withdraw consent at any time. Most of this is in the app (Export My Data, account editing, Withdraw Health Consent, and Delete Account), and anything else, such as changing your username, can be requested by email below. No decisions about you are made automatically, and you never have to give personal data beyond what an account needs. Without it, offline mode still works. You also have the right to complain to the Hellenic Data Protection Authority (www.dpa.gr) or the data protection authority where you live.",
  },
  {
    title: "Your control",
    body:
      "Settings → Privacy and Data → Delete Account permanently removes your account and everything attached to it: workouts, plans, progress photos, supplements and reminders, and friend connections. In online mode the deletion is carried out on the server you are signed in to. In offline mode it wipes the local profile and database. Crash reports are not deleted with the account. They contain only its random identifier and expire on their own within 90 days. Settings → Clear All Data deletes your data while keeping the account. Signing out keeps this device's data for when you sign back in. Use Clear All Data or Delete Account to remove it. Uninstalling the app also removes everything stored on the device.",
  },
  {
    title: "Getting a copy of your data",
    body:
      "Settings → Privacy and Data → Export My Data writes everything stored about your account to a JSON file in the app's Downloads folder, which you can then move or share wherever you like. It contains this account's data on this device, including progress photo images (the newest up to about 32 MB, and the file says how many were left out), and in online mode also everything the server you are signed in to holds about you. Other profiles on the same device are not included. You can protect the file with a passphrase. Without one, anyone who gets the file can read it, health data included. Reports other users filed about you are listed with their reason and date, without naming who filed them.",
  },
  {
    title: "Blocking and reporting",
    body:
      "Any account can be blocked from its entry in the Friends tab: a friend, a pending request, or a search result. Blocking removes the friendship, cancels every sharing permission in both directions, and prevents either of you sending the other a friend request until you unblock them. Blocked accounts are managed under Settings → Privacy and Data. You can also report an account: reports are stored on the server you are signed in to for its operator to review (on the official server, the developer), and they are the person who can act on them.",
  },
  {
    title: "Children",
    body:
      "OwnGains is not meant for children. You must be at least 16 to use it, and accepting the terms confirms that you are.",
  },
  {
    title: "Contact",
    body: "Questions about this policy, or a request about your data? Reach out at:",
    email: "kostissuperak0s@gmail.com",
  },
];

export default function PrivacyPolicyScreen({
  navigation,
}: PrivacyPolicyScreenProps): React.JSX.Element {
  return (
    <LegalScreen
      title='Privacy Policy'
      updated='October 2026'
      sections={SECTIONS}
      onBack={() => navigation.goBack()}
    />
  );
}
