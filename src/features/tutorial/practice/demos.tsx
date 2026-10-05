import { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import { useAlert } from "@shared/components/CustomAlert";
import { IntensityPicker } from "@shared/components/IntensityPicker";
import { useTwoFingerPull } from "@shared/context/hooks/useTwoFingerPull";
import { PermissionRow } from "@features/friends/components/PermissionRow";
import { PERMISSION_TYPES, trainerGrantConfirmation } from "@features/friends/components/FriendPermissions";
import type { PermissionType } from "@features/friends/types";
import { TrainerBanner, makeTrainerBannerStyles } from "@features/workout/components/TrainerBanner";
import { PartnerBanner } from "@features/workout/components/PartnerBanner";
import MuscleMap from "@features/tracking/components/MuscleMap";
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from "@features/tracking/types/muscleRecovery";
import type { WorkoutData } from "@shared/types";
import type { ChecklistItem } from "../chapters";
import { Hand } from "../motion";
import { usePracticeStyles } from "./styles";

export const DEMO_FRIEND = "Alex";

export interface PracticeProps {
  readonly onComplete: () => void;
}

export function Checklist({ items, onComplete }: PracticeProps & { readonly items: ChecklistItem[] }) {
  const s = usePracticeStyles();
  const [done, setDone] = useState<number[]>([]);
  const [last, setLast] = useState<number | null>(null);
  const tap = (i: number) => {
    setLast(i);
    if (done.includes(i)) return;
    const next = [...done, i];
    setDone(next);
    if (next.length === items.length) onComplete();
  };
  return (
    <View style={s.demo}>
      <Text style={s.muted}>Tap each one · {done.length}/{items.length}</Text>
      <View style={s.grid}>
        {items.map((item, i) => (
          <TouchableOpacity
            key={item.label}
            style={[s.tile, done.includes(i) && s.tileDone]}
            onPress={() => tap(i)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: done.includes(i) }}
          >
            <Text style={s.tileIcon}>{done.includes(i) ? "✓" : item.icon}</Text>
            <Text style={s.tileLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {last !== null && <Text style={s.result} accessibilityLiveRegion="polite">{items[last].result}</Text>}
    </View>
  );
}

export function LogSetDemo({ onComplete }: PracticeProps) {
  const { colors } = useTheme();
  const s = usePracticeStyles();
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [effort, setEffort] = useState(7);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const valid = Number(weight) > 0 && Number(reps) > 0;
  return (
    <View style={s.demo}>
      <Text style={s.title}>Bench Press · Set 1</Text>
      <TouchableOpacity
        style={s.chip}
        onPress={() => {
          setWeight("60");
          setReps("8");
        }}
        accessibilityRole="button"
        accessibilityLabel="Use last time: 60 kilograms for 8 reps"
      >
        <Text style={s.chipText}>Last time 60 kg × 8 · Use it</Text>
      </TouchableOpacity>
      <View style={s.row}>
        <TextInput style={s.input} value={weight} onChangeText={(t) => setWeight(t.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" placeholder="kg" placeholderTextColor={colors.textMuted} accessibilityLabel="Weight in kilograms" />
        <TextInput style={s.input} value={reps} onChangeText={(t) => setReps(t.replace(/\D/g, ""))} keyboardType="number-pad" placeholder="reps" placeholderTextColor={colors.textMuted} accessibilityLabel="Reps" />
      </View>
      <Text style={s.muted}>Effort {effort}/10</Text>
      <IntensityPicker
        value={effort}
        onChange={setEffort}
        getColor={() => colors.accent}
        unselectedBackground={colors.surface}
        unselectedBorder={colors.surfaceBorder}
        unselectedTextColor={colors.textPrimary}
        styles={{ container: s.effortRow, button: s.effortBtn, buttonText: s.effortText }}
      />
      <TextInput style={s.input} value={notes} onChangeText={setNotes} placeholder="Notes (optional)" placeholderTextColor={colors.textMuted} accessibilityLabel="Notes" />
      <TouchableOpacity
        style={[s.primary, !valid && s.disabled]}
        disabled={!valid}
        onPress={() => {
          if (!valid) return;
          setSaved(true);
          onComplete();
        }}
        accessibilityRole="button"
        accessibilityLabel="Save set"
        accessibilityState={{ disabled: !valid }}
      >
        <Text style={s.primaryText}>Save set</Text>
      </TouchableOpacity>
      {saved && (
        <>
          <Text style={s.celebrate}>🏆 New personal record!</Text>
          <Text style={s.result}>📈 {reps} reps at {weight} kg. Next time, try {Number(weight) + 2.5} kg.</Text>
        </>
      )}
    </View>
  );
}

const DEMO_PROGRAM = { split: ["Push", "Pull", "Legs"], totalDays: 3 } as unknown as WorkoutData;

export function PermissionsDemo({ onComplete }: PracticeProps) {
  const s = usePracticeStyles();
  const { alert, AlertComponent } = useAlert();
  const [granted, setGranted] = useState<ReadonlySet<PermissionType>>(new Set());
  const [trainerSeen, setTrainerSeen] = useState(false);
  const [note, setNote] = useState("");

  const titleOf = (type: PermissionType) => PERMISSION_TYPES.find((p) => p.type === type)?.title ?? type;
  const grant = (type: PermissionType) => {
    const apply = () => {
      setGranted((g) => new Set(g).add(type));
      if (type === "trainer") setTrainerSeen(true);
      setNote(
        type === "analytics" && !granted.has("history")
          ? "Analytics needs History Access too, so grant that as well."
          : `${DEMO_FRIEND} now has ${titleOf(type)}.`,
      );
    };
    if (type !== "trainer") return apply();
    const { title, message } = trainerGrantConfirmation(DEMO_FRIEND);
    alert(title, message, [{ text: "Cancel", style: "cancel" }, { text: "Grant access", onPress: apply }], "warning");
  };
  const revoke = (type: PermissionType) => {
    setGranted((g) => {
      const next = new Set(g);
      next.delete(type);
      return next;
    });
    setNote(`${titleOf(type)} revoked. ${DEMO_FRIEND} loses it straight away.`);
    if (trainerSeen || type === "trainer") onComplete();
  };

  return (
    <View style={s.demo}>
      {PERMISSION_TYPES.map(({ type, icon, title, describe }) => (
        <PermissionRow
          key={type}
          icon={icon}
          title={title}
          description={describe(DEMO_FRIEND, DEMO_PROGRAM)}
          friendName={DEMO_FRIEND}
          granted={granted.has(type)}
          onGrant={() => grant(type)}
          onRevoke={() => revoke(type)}
        />
      ))}
      {note !== "" && <Text style={s.result} accessibilityLiveRegion="polite">{note}</Text>}
      {AlertComponent}
    </View>
  );
}

export function FriendRequestDemo({ onComplete }: PracticeProps) {
  const s = usePracticeStyles();
  const [state, setState] = useState<"pending" | "accepted" | "declined">("pending");
  const [hint, setHint] = useState("");
  return (
    <View style={s.demo}>
      <View style={s.row}>
        <TouchableOpacity style={s.chip} onPress={() => setHint("Scan a friend's QR code from Search to add them instantly.")} accessibilityRole="button" accessibilityLabel="Add by QR code">
          <Text style={s.chipText}>📷 Scan QR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.chip} onPress={() => setHint("Search by username and tap Add to send a request.")} accessibilityRole="button" accessibilityLabel="Add by username">
          <Text style={s.chipText}>🔎 Username</Text>
        </TouchableOpacity>
      </View>
      {hint !== "" && <Text style={s.result}>{hint}</Text>}
      <View style={s.mockList}>
        <Text style={s.title}>👤 {DEMO_FRIEND} wants to be friends</Text>
        {state === "pending" && (
          <View style={s.row}>
            <TouchableOpacity style={s.secondary} onPress={() => setState("declined")} accessibilityRole="button" accessibilityLabel={`Decline ${DEMO_FRIEND}'s friend request`}>
              <Text style={s.secondaryText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primary, { flex: 1 }]}
              onPress={() => {
                setState("accepted");
                onComplete();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Accept ${DEMO_FRIEND}'s friend request`}
            >
              <Text style={s.primaryText}>Accept</Text>
            </TouchableOpacity>
          </View>
        )}
        {state === "accepted" && <Text style={s.celebrate}>🎉 You and {DEMO_FRIEND} are friends</Text>}
        {state === "declined" && (
          <TouchableOpacity style={s.chip} onPress={() => setState("pending")} accessibilityRole="button" accessibilityLabel="Try again">
            <Text style={s.chipText}>Request declined · Try again</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const NO_SORENESS = Object.fromEntries(
  Object.keys(MUSCLE_GROUP_LABELS).map((m) => [m, 0]),
) as Record<MuscleGroup, number>;

export function SorenessDemo({ onComplete }: PracticeProps) {
  const s = usePracticeStyles();
  const [view, setView] = useState<"front" | "back">("front");
  const [sore, setSore] = useState(NO_SORENESS);
  const count = Object.values(sore).filter((v) => v > 0).length;
  return (
    <View style={s.demo}>
      <View style={s.segment}>
        {(["front", "back"] as const).map((v) => (
          <TouchableOpacity key={v} style={[s.segmentBtn, view === v && s.segmentActive]} onPress={() => setView(v)} accessibilityRole="button" accessibilityLabel={`Show ${v}`} accessibilityState={{ selected: view === v }}>
            <Text style={s.secondaryText}>{v === "front" ? "Front" : "Back"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ alignItems: "center" }}>
        <MuscleMap
          view={view}
          selectedMuscles={new Set()}
          sorenessMap={sore}
          showLabels
          onPressMuscle={(m) => {
            setSore((prev) => ({ ...prev, [m]: prev[m] ? 0 : 6 }));
            onComplete();
          }}
        />
      </View>
      <Text style={s.muted}>{count} sore muscle{count === 1 ? "" : "s"} logged</Text>
    </View>
  );
}

export function TwoFingerPullDemo({ onComplete }: PracticeProps) {
  const s = usePracticeStyles();
  const [opened, setOpened] = useState(false);
  const open = () => {
    setOpened(true);
    onComplete();
  };
  const { panHandlers, isPulling, pullArmed } = useTwoFingerPull(open);
  let label = "Put two fingers here and pull down";
  if (opened) label = "🧩 Widget gallery opened!";
  else if (pullArmed) label = "Let go to open";
  else if (isPulling) label = "Keep pulling…";
  return (
    <View style={s.demo}>
      <View style={s.pullArea} {...panHandlers}>
        <Text style={s.title}>{label}</Text>
        {!opened && <Hand gesture="twoFinger" x={140} y={20} />}
      </View>
      <TouchableOpacity style={s.chip} onPress={open} accessibilityRole="button" accessibilityLabel="Can't use two fingers? Open the gallery with a tap">
        <Text style={s.chipText}>Can't use two fingers? Tap instead</Text>
      </TouchableOpacity>
    </View>
  );
}

export function BannerDemo({ variant, onComplete }: PracticeProps & { readonly variant: "trainer" | "partner" | "trainerSession" }) {
  const { colors } = useTheme();
  const s = usePracticeStyles();
  const [phase, setPhase] = useState(0);
  const [tab, setTab] = useState<"me" | "trainees">("trainees");
  const [day, setDay] = useState(1);
  const finish = () => {
    setPhase(2);
    onComplete();
  };

  if (variant === "trainer") {
    return (
      <View style={s.demo}>
        {phase < 2 && <TrainerBanner trainerUsername={DEMO_FRIEND} />}
        <View style={s.mockList}>
          <Text style={s.tileLabel}>Bench Press · 60 kg × 8 ✓</Text>
          <Text style={s.muted}>Logged by {DEMO_FRIEND}</Text>
        </View>
        {phase < 2 ? (
          <TouchableOpacity style={s.secondary} onPress={finish} accessibilityRole="button" accessibilityLabel="Revoke Trainer Access">
            <Text style={s.secondaryText}>Revoke Trainer Access</Text>
          </TouchableOpacity>
        ) : (
          <Text style={s.result}>{DEMO_FRIEND}'s access is gone, and so is the banner.</Text>
        )}
      </View>
    );
  }

  if (variant === "partner") {
    return (
      <View style={s.demo}>
        {phase === 0 && (
          <TouchableOpacity style={s.primary} onPress={() => setPhase(1)} accessibilityRole="button" accessibilityLabel={`Invite ${DEMO_FRIEND} to lift together`}>
            <Text style={s.primaryText}>🤝 Invite {DEMO_FRIEND}</Text>
          </TouchableOpacity>
        )}
        {phase === 1 && (
          <PartnerBanner
            partnerProgress={{ exerciseIndex: 0, setIndex: 1, exerciseName: "Bench Press", readyForNext: false, lastUpdated: Date.now() }}
            isPartnerReady={false}
            syncPulse={false}
            partnerUsername={DEMO_FRIEND}
            onLeave={finish}
          />
        )}
        {phase === 2 && <Text style={s.result}>You left the session. {DEMO_FRIEND} keeps training on their own.</Text>}
      </View>
    );
  }

  const banner = makeTrainerBannerStyles(colors);
  return (
    <View style={s.demo}>
      <View style={s.segment}>
        {(["me", "trainees"] as const).map((t) => (
          <TouchableOpacity key={t} style={[s.segmentBtn, tab === t && s.segmentActive]} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityLabel={t === "me" ? "Me" : "Trainees"} accessibilityState={{ selected: tab === t }}>
            <Text style={s.secondaryText}>{t === "me" ? "Me" : "Trainees"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === "me" && <Text style={s.result}>Your own workout, untouched while you coach.</Text>}
      {tab === "trainees" && phase < 2 && (
        <View style={banner.container}>
          <Text style={banner.label} numberOfLines={1}>
            🧑‍🏫 Logging for <Text style={banner.name}>{DEMO_FRIEND}</Text>
          </Text>
          <TouchableOpacity style={s.chip} onPress={() => setDay((d) => (d % 3) + 1)} accessibilityRole="button" accessibilityLabel={`Day ${day}, change ${DEMO_FRIEND}'s workout day`}>
            <Text style={s.chipText}>Day {day} ▾</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.chip} onPress={finish} accessibilityRole="button" accessibilityLabel="Stop trainer session">
            <Text style={[s.chipText, { color: colors.error }]}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}
      {phase === 2 && <Text style={s.result}>Session stopped. {DEMO_FRIEND} sees everything you logged.</Text>}
    </View>
  );
}
