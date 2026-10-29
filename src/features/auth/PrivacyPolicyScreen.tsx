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
      "When you first open OwnGains you choose offline or online mode. In offline mode your workouts, plans, supplements, tracking data, and settings are stored only on your device using local SQLite storage. Nothing about you leaves the device except the crash reports and usage metrics you opt into, and the scanner metrics described under QR code scanner. The app also checks the official server for bug-fix updates, GitHub builds also check GitHub for new releases, and a tip you choose to send goes through Google Play or Ko-fi, all described below. When you choose a server, the app can also look for OwnGains servers on your local Wi-Fi network. That scan does not leave the local network.",
  },
  {
    title: "Online mode and the official server",
    body:
      "If you choose online mode and create an account, your profile, workouts, sets, programs, and friend connections are stored on the server you sign in to, so you can use the app across devices and with friends. By default that is the official server at owngains.superak0s.com. You can instead enter the address of a server you or someone else runs, and whoever operates that server controls the data you sync to it. You can switch back to offline mode at any time, and your device keeps working with local data only.",
  },
  {
    title: "Health and fitness data",
    body:
      "Besides workouts and supplements, you can log body weight, body fat, body measurements, menstrual cycle, injuries, muscle soreness, hydration, macros, personal notes, and progress photos. Some of this, especially menstrual cycle data, is sensitive health information. The official server does not store any of it: tracking data and supplements are kept on your device even in online mode, and Settings lists them under Kept On This Device. A server run by someone else may store them. If it does not, Settings says so in the same place. This data is never shared with friends unless you grant Tracking Access, described under Trainer access.",
  },
  {
    title: "Health Connect",
    body:
      "On Android you can connect OwnGains to Health Connect in Settings. OwnGains reads only the data types you allow in the Health Connect permission screen and never writes to Health Connect. Weight, body fat, hydration and nutrition from the last 30 days are imported into your logs and stored like entries you log by hand: on your device, or on a server run by someone else when it stores tracking data. The official server does not store it: tracking data is kept on your device.\n\nSteps, heart rate and sleep are shown in Tracking and Home widgets. A daily summary of them (step count, average, lowest and highest heart rate, minutes slept) is kept on your device only, so days older than Health Connect's 30-day limit remain, and is never sent to any server. Turn off Keep Health Data in Settings, Storage and Sync, Health Connect to stop copying any Health Connect data, and choose there whether to delete the saved summaries.\n\nHealth values are never included in crash reports or usage telemetry. You can remove access at any time in Settings, Storage and Sync, Health Connect, Manage Permissions, or in the Health Connect app. Entries already imported remain until you delete them.",
  },
  {
    title: "Account data",
    body:
      "In online mode the server stores your username, email, password (hashed, never in plain text), an optional display name and an optional profile photo to identify you, plus sign-in tokens that expire on their own. Failed sign-in attempts are counted against a hashed form of the name you typed, to slow down password guessing, and the count is deleted after a day. Anyone with an account on the same server can find your username by searching for its first few letters. The profile photo is stored as one small copy with its metadata (such as location) removed, so it appears on your other devices. Your display name, profile photo and workout activity are shared only with people you've added as friends. A friend can see that you are working out, or watch a workout live, only if you have granted them that permission. While anyone is watching, the workout screen shows who, with a button to stop them.",
  },
  {
    title: "Sign in with Google",
    body:
      "On the official server you can sign in with Google instead of a password. The app is then shown your Google account's email, name and a token from Google, and passes only the token to the official server. The server checks it with Google and stores your Google account ID and verified email with your account. If an account with that email already exists, Google sign-in is added to it only after you enter that account's password. You can unlink Google in Settings, which removes the stored Google account ID. Google can see that you signed in to OwnGains, under Google's own privacy policy. The button is never shown when you use another server, so no other server receives a Google token. Deleting your account deletes the stored Google account ID with it.",
  },
  {
    title: "Server logs",
    body:
      "To diagnose problems and protect the service, the official server and the proxy in front of it log each request: the time, the address requested (which can include your account’s random identifier), and the IP address it came from, which is always recorded. These logs never contain request or response contents, passwords, or health data, and are deleted after at most 14 days. The server also saves recent failed and slow requests and logged errors (the time, the address requested, the response status and the error) for up to 30 days, without your username or IP address, so the developer can find faults. The most recent of them are also held in memory with the username and IP address, and those are lost whenever the server restarts.",
  },
  {
    title: "Trainer access",
    body:
      "You can grant a friend Trainer Access from their entry in the Friends tab. Another user can also send you a trainer request, which shows under Friends. Accepting it adds them as a friend with Trainer Access. Until you accept or decline it, the server stores who sent it, who it is for and when, and then deletes it. A trainer can view your workout history, analytics, notes, and program, watch your workouts live, log workouts for you, and edit your program. A workout a trainer logs for you records which trainer logged it, and that link is removed if the trainer deletes their account. They cannot access your account or your supplement data, and apart from changes to your program they cannot delete anything.\n\nThey see your tracking data only if you also grant Tracking Access. Your phone then sends your body weight, body fat, measurements, hydration, macros and goals, injuries, soreness, muscle notes, menstrual cycle and progress photos to the trainer's phone, encrypted with a key that only the trainer's phone holds. The server stores the trainer's public keys and passes the encrypted data on without being able to read it. It deletes each message once the trainer's phone has received it, and any message not received after 30 days. The trainer's phone keeps a copy until you turn Tracking Access off or end Trainer Access, and then deletes it the next time the trainer opens Clients. You can revoke either grant at any time from the same place, and blocking the friend revokes both.",
  },
  {
    title: "Scheduled workouts",
    body:
      "You can schedule workouts for later days. In offline mode they are kept on your device. In online mode the server you are signed in to stores each one's name, time, length, program day and reminder setting until you delete it or your account. A trainer can suggest a workout for your schedule, which stays pending until you accept or decline it, and the trainer can see your scheduled workouts. A suggestion the trainer withdraws is kept, marked as withdrawn, until your account is deleted. If you turn on Add to my calendar, the app asks for calendar permission and writes your accepted workouts as events to a calendar on your phone. It reads your calendars only to find that one, and never sends calendar data anywhere.",
  },
  {
    title: "Messages",
    body:
      "In online mode you can message your friends, your trainer and your clients. The server you are signed in to stores each message's text, who sent it, who it is for, when it was sent and when it was read, so the conversation appears on both people's devices. The person you write to sees when you read their messages. Messages are not end to end encrypted, so the operator of that server (on the official server, the developer) could read them. Clearing your data deletes the messages you sent and keeps the ones you received, since those are the other person's words. Deleting either account deletes the whole conversation. Blocking someone, or ending a friendship or Trainer Access with no other link between you, stops new messages while the history remains readable. So you hear about a new message while the app is closed, the app gives the server this device's push address (a token from Firebase Cloud Messaging) when you sign in, and removes it when you sign out. Getting that token connects the device to Google, which sees its IP address. On the official server, a new message then sends that address a notification through Google's Firebase Cloud Messaging. It says only \"You have a new message\" and carries the sender's random identifier so tapping it opens the conversation. Google never receives the message text or anyone's username. A self-hosted server offers messages only if its operator set up Firebase. Deleting your account deletes the stored push addresses.",
  },
  {
    title: "Skin marketplace",
    body:
      "A skin is a color theme, a set of widget layouts, or both, shared through a skin marketplace. The official marketplace runs next to the official server on the same hardware and is the default, even when you use a self-hosted server. Anyone can browse and download skins without an account. Opening Skins contacts the marketplace even in offline mode, without your account. Each download sends a random identifier created for this app install, and the marketplace keeps only a salted hash of it with the skin, so it can count unique downloads without knowing who downloaded. To publish, rate or report a skin you sign in to the official server, and the marketplace then stores your account's random identifier and username with the skins you publish, and a keyed hash of that identifier with your ratings and reports, so each account counts once. Published skins are public and show your username. Your IP address is held in memory for about a minute to limit abuse. You can delete a skin you published at any time under Skins → My skins. When you delete your account in the app, your skins stay public without your name, and your ratings and reports keep only the hash, which no longer leads to an account. If your account is deleted any other way, email the address below to have this done. The app sends your sign-in token only to a marketplace on the same address as your server. A marketplace someone else runs is their responsibility.",
  },
  {
    title: "QR code scanner",
    body:
      "Scanning a friend's or client's QR code uses Google ML Kit, which runs on your device. The camera image is read on the phone and never leaves it. ML Kit sends Google usage and performance metrics about the scanner (device model, Android version, app name and version, and how a scan performed or why it failed) to maintain and improve it, under Google's own terms. It sends nothing you log in OwnGains.",
  },
  {
    title: "Location",
    body:
      "OwnGains requests no location permission and never reads GPS or other precise location. Supplement reminders are scheduled by time of day only. The only location information processed is the approximate country worked out from your IP address by Google Analytics for Firebase, and the country, region and city of website visits, both described below.",
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
      "Connections to the official server and the crash-report server pass through Cloudflare, which protects them from attacks and abuse. To do that Cloudflare decrypts the traffic in transit, so it handles your IP address, device details, and what you send and receive, including sign-in details and synced workouts. It acts only on the developer's instructions, does not keep that content, and writes its own security logs under its own privacy policy. On the web pages it may set a strictly necessary security cookie that tells people apart from bots.",
  },
  {
    title: "Tips",
    body:
      "The Support Development button at the top of Settings offers optional one-time tips through Google Play. In app builds downloaded from GitHub instead of Google Play, the same button opens Ko-fi, which processes the tip under its own privacy policy. Google processes the payment under its own privacy policy. The developer receives only Google's order record (order number, item, price, and country), never your payment details. Tips are not linked to your OwnGains account and nothing about them is sent to any OwnGains server.",
  },
  {
    title: "Update checks",
    body:
      "App builds downloaded from GitHub check GitHub for a newer release at most once a day. GitHub sees your IP address with that request, under its own privacy policy. Nothing about you or your account is sent. Google Play builds make no such check.\n\nEvery build, in offline mode too, asks the official server for a bug-fix update when it opens and when you return to it. The request carries only the app's build fingerprint, its distribution channel (Google Play or GitHub), the platform, and the ID of the update it is running. It is not linked to an account and the server does not store it. The server sees your IP address while answering, like any connection. A downloaded update is signed by the developer and the app refuses one that is not.",
  },
  {
    title: "Crash reports and usage metrics",
    body:
      "If you allow crash reporting, crash and error diagnostics (the error message, the stack trace, and basic device and app version details) are sent to the developer's own crash-report server at glitchtip.superak0s.com (a self-hosted GlitchTip, not a third-party service) to help fix bugs. Console and network logs are stripped before sending, so reports do not contain your workout data or password. Reports are tagged with your account's ID on the server (never your username or email) so repeat crashes can be counted, and performance traces record the API paths a request hit, never the request or response contents. The crash-report server sees the IP address a report comes from and records it with the report. Usage metrics are off unless you switch them on. Screen-load and request timings and diagnostic logs then go to the same crash-report server. Usage counts go to Google Analytics for Firebase: which screens and features you open, which days you open the app, how long each workout lasted and how many sets and exercises it had, and how many days it has been since your last workout as a range (such as 4 to 7). Firebase also records its standard app events (first open, sessions and engagement time) with your device model, Android version, app version and approximate country derived from your IP address, under a random app-instance ID. Firebase Performance Monitoring receives how long the app takes to start, how smoothly screens render, how long requests to your server take (the API path with IDs and names replaced, the method and the status code, never the server address or any request or response content), and how long slower operations take (syncing, loading your analytics, importing a plan, backing up, restoring, a Health Connect sync), with the same device details and a random Firebase installation ID. Firebase never receives your account ID, username or email, the advertising ID is not collected, and ad personalization is off. Usage metrics never include exercise names, weights, reps, notes or anything else you log. A change to them applies fully from the next app launch. You choose both when you first sign in, and can change them any time under Settings → Privacy and Data. Crash reporting takes effect immediately, including for crashes inside Android itself. Builds made without a crash-report key send nothing at all.",
  },
  {
    title: "Why we process your data",
    body:
      "Your account, synced workouts, messages and their notifications, user search, and the skins, ratings and reports you publish to the marketplace are processed to provide the online features you signed up for (performance of a contract, GDPR Art. 6(1)(b)). Because workouts and body data can reveal information about your health, storing them on a server also rests on your explicit consent (Art. 9(2)(a)), given when you first sign in. You can withdraw it under Settings → Privacy and Data → Withdraw Health Consent, which deletes your workout history and any body data from the server and switches the app to on-device storage, copying your current plan and its history to this device first, or by deleting your account. Withdrawing does not affect processing that happened before. Crash reports and usage metrics are sent only with your consent (Art. 6(1)(a)), which you can withdraw at any time in Settings. Server logs, Cloudflare's protection, the sign-in throttle, backups, update checks, the QR scanner's metrics, counting skin downloads, and reports about abusive accounts are processed for the legitimate interest of keeping the service secure and working (Art. 6(1)(f)). Google Play's order records for tips are kept to meet tax and accounting law (Art. 6(1)(c)).",
  },
  {
    title: "How long we keep it",
    body:
      "Your account and everything synced to it, messages included, are kept until you delete the account, then removed immediately from the live database. The official server keeps database backups for up to 30 days, used only to recover from a failure, so deleted data is gone from every copy within 30 days. For 32 days the server keeps only the random identifier of a deleted account, so that restoring a backup cannot bring the account back. Sign-in tokens are deleted once they expire, failed sign-in counts after a day, accounts that never finished sign-up (the consent screen) after 30 days, and server logs after at most 14 days. Crash reports, performance traces and diagnostic logs are deleted automatically after 90 days. Google Analytics for Firebase deletes usage events after 2 months, and Firebase Performance Monitoring deletes timings tied to an IP address after 30 days and all other timings after 60 days. Reports you file, or that are filed about you, are kept after either account is deleted so the operator can act on repeated abuse. They keep the reported username and the reporter's optional note, but no longer name the reporter. Every report is deleted a year after it was filed.",
  },
  {
    title: "Where your data is stored",
    body:
      "The official server and crash-report server run on the developer's own hardware in Greece, inside the European Union. Your data is not shared with anyone else, apart from these services when you use them, each under its own privacy policy: Cloudflare (United States, under the EU-US Data Privacy Framework and Cloudflare's data processing terms) handles all traffic to both servers. GitHub (United States, under the EU-US Data Privacy Framework) receives update checks from GitHub builds. Google (United States, under the EU-US Data Privacy Framework) receives Google Play tips and downloads, message notifications (Firebase Cloud Messaging, without their text), usage metrics you switch on (Google Analytics for Firebase and Firebase Performance Monitoring), QR scanner metrics (ML Kit), and email you send the developer, which goes through Gmail. Ko-fi (United Kingdom, covered by an EU adequacy decision) receives tips from GitHub builds.",
  },
  {
    title: "Your rights",
    body:
      "Under the GDPR you can ask for access to your data, correction, deletion, a portable copy, or restriction of processing, object to processing based on legitimate interest, and withdraw consent at any time. Most of this is in the app (Export My Data, account editing, Withdraw Health Consent, and Delete Account), and anything else, such as changing your username, can be requested by email below. No decisions about you are made automatically, and you never have to give personal data beyond what an account needs. Without it, offline mode still works. You also have the right to complain to the Hellenic Data Protection Authority (www.dpa.gr) or the data protection authority where you live.",
  },
  {
    title: "Your control",
    body:
      "Settings → Privacy and Data → Delete Account permanently removes your account and everything attached to it: workouts, plans, profile and progress photos, supplements and reminders, friend connections, and messages you sent or received. In online mode the deletion is carried out on the server you are signed in to. In offline mode it wipes the local profile and database. Crash reports are not deleted with the account. They contain only its random identifier and expire on their own within 90 days. Settings → Clear All Data deletes your data while keeping the account. Signing out keeps this device's data for when you sign back in. Use Clear All Data or Delete Account to remove it. Uninstalling the app also removes everything stored on the device.",
  },
  {
    title: "Getting a copy of your data",
    body:
      "Settings → Privacy and Data → Export My Data writes everything stored about your account to a JSON file in the app's Downloads folder, which you can then move or share wherever you like. It contains this account's data on this device, including progress photo images (the newest up to about 32 MB, and the file says how many were left out), and in online mode also the records the server you are signed in to stores about your account, messages you received included. Photos stored on the server are listed without the image itself, which you can view in the app. Skins you published are listed under Skins → My skins. Other profiles on the same device are not included. You can protect the file with a passphrase. Without one, anyone who gets the file can read it, health data included. Reports other users filed about you are listed with their reason and date, without naming who filed them.",
  },
  {
    title: "Blocking and reporting",
    body:
      "Any account can be blocked from its entry in the Friends tab: a friend, a pending request, or a search result. Blocking removes the friendship, cancels every sharing permission in both directions, and prevents either of you sending the other a friend request until you unblock them. Blocked accounts are managed under Settings → Privacy and Data. You can also report an account: reports are stored on the server you are signed in to for its operator to review (on the official server, the developer), and they are the person who can act on them.",
  },
  {
    title: "Children",
    body:
      "OwnGains is not meant for children. You must be at least 16 to use it, and accepting the terms confirms that you are. If we learn that an account belongs to someone under 16, we delete it. You can report such an account from its entry in the Friends tab, or by email.",
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
      updated='29 October 2026'
      sections={SECTIONS}
      onBack={() => navigation.goBack()}
    />
  );
}
