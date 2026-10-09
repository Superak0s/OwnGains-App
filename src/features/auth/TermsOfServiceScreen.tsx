import React from "react";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";
import LegalScreen, { type LegalSection } from "./components/LegalScreen";
import { TERMS_VERSION } from "./termsAcceptance";

type TermsOfServiceScreenProps = {
  readonly navigation: NativeStackNavigationProp<
    RootStackParamList,
    "TermsOfService"
  >;
};

const SECTIONS: ReadonlyArray<LegalSection> = [
  {
    title: "What OwnGains is",
    body:
      "OwnGains is a workout tracker that runs on your device. It is made and run by Konstantinos Tsiaros, Anaximenous 20, Thessaloniki, Greece, as a free personal project, not by a company. You can keep everything on this device in offline mode, sign in to the official server at owngains.superak0s.com, or point the app at a server you or someone else hosts.",
  },
  {
    title: "Where your account lives",
    body:
      "In online mode your account exists only on the server you sign in to. On the official server, the developer runs it, sets its rules, can see and administer the data you sync to it, can reset your password, and can remove your account. If you sign in with Google there, you also need a working Google account to sign in, and Google's terms apply to that account. On a server someone else runs, all of that is up to them, and your agreement about how it is operated is with that person, not with OwnGains.",
  },
  {
    title: "Acceptable use",
    body:
      "Do not use OwnGains to harass, impersonate, or send unwanted contact to other people through the friends, sharing, or live session features. Do not attempt to access another person's account or data, or to disrupt a server you have not been given access to. Server operators, including the developer on the official server, may suspend or remove accounts that do this on the instance they run. You must be at least 16 to use OwnGains, and accepting these terms confirms that you are.",
  },
  {
    title: "Reports and moderation",
    body:
      "On the official server you can report a user from their entry in the Friends tab, or by email. Every report is reviewed by hand by the developer. Nothing is moderated automatically. Email reports are confirmed on receipt. If your account is suspended, the reason is shown when you try to sign in. You can contest any decision, or the handling of a report you made, by email. It will be looked at again and you will get a reasoned answer. You can also take the matter to the courts or the competent authority.",
    email: "kostissuperak0s@gmail.com",
  },
  {
    title: "Your content is yours",
    body:
      "Your workouts, plans, notes, and photos remain yours. OwnGains claims no ownership of them. You give the operator of the server you sync to a non-exclusive, royalty-free licence to store, back up, and show them to you and to the friends you share with, only to run the service. It ends when you delete them, apart from copies that remain in backups until those expire. Settings → Privacy and Data → Export My Data gives you a copy at any time, and Delete Account in the same place removes them.",
  },
  {
    title: "Availability",
    body:
      "Offline mode keeps working as long as the app is installed. Online mode depends on the server you chose being reachable and running. The official server is run on a best-effort basis, with no guaranteed uptime. If it is going to shut down, or your account on it is going to be removed for any reason other than a breach of these terms or a legal obligation, you will be told at least 30 days in advance so you can export your data. A server someone else runs is entirely their responsibility. Keep your own exports if the data matters to you.",
  },
  {
    title: "Tips",
    body:
      "Tips offered in the app are voluntary. They unlock no features or content and do not change the service you get. In the Google Play version, Google Play processes the payment and its refund policy applies. In the version downloaded from GitHub, tips go through Ko-fi and its terms apply. Either way, any rights your local law gives you also apply.",
  },
  {
    title: "Not medical advice",
    body:
      "OwnGains records what you tell it about your training. It does not assess your health, and nothing it calculates or suggests is medical or fitness advice. Talk to a qualified professional before starting or changing a training programme, and stop if something hurts.",
  },
  {
    title: "Warranty and liability",
    body:
      "OwnGains is provided \"as is\", without warranty of any kind, express or implied, including any warranty of merchantability, fitness for a particular purpose or non-infringement. To the fullest extent the law allows, the author is not liable for any loss of data, loss of profit, or any indirect or consequential damage arising from your use of the app or the official server. Nothing here limits liability for death or personal injury caused by negligence, for fraud, intent or gross negligence, or any other liability that cannot lawfully be limited, and if your local consumer law gives you rights that override any of this, those rights come first.",
  },
  {
    title: "Changes to these terms",
    body:
      "These terms may change as the app changes. The current version is always the one published with the latest release of the app, with its last-updated date at the top. When a release changes them, the app asks you to accept the new version before you continue. If you do not accept, export your data and stop using the app.",
  },
  {
    title: "Governing law",
    body:
      "These terms are governed by the law of Greece, and the courts of Greece have jurisdiction over any dispute arising from them. If you use OwnGains as a consumer in another country, you keep the protection of the mandatory law of the country you live in, and you can also bring a claim in the courts there.",
  },
  {
    title: "Contact",
    body: "Questions about these terms? Reach out at:",
    email: "kostissuperak0s@gmail.com",
  },
];

export default function TermsOfServiceScreen({
  navigation,
}: TermsOfServiceScreenProps): React.JSX.Element {
  return (
    <LegalScreen
      title='Terms of Service'
      updated={TERMS_VERSION}
      sections={SECTIONS}
      onBack={() => navigation.goBack()}
    />
  );
}
