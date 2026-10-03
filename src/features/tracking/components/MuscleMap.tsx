import React from "react";
import { View, StyleSheet } from "react-native";
import {
  Svg,
  Path,
  Text as SvgText,
  Defs,
  RadialGradient,
  LinearGradient,
  Stop,
} from "react-native-svg";
import { useTheme } from "@shared/context/ThemeContext";
import type { MuscleGroup } from "../types/muscleRecovery";
import { MUSCLE_GROUP_LABELS } from "../types/muscleRecovery";

interface MuscleMapProps {
  readonly view: "front" | "back";
  readonly selectedMuscles: Set<string>;
  // muscle -> intensity (0-10), any value > 0 = sore (light orange)
  readonly sorenessMap: Record<MuscleGroup, number>;
  readonly onPressMuscle: (muscle: MuscleGroup) => void;
  readonly showLabels?: boolean;
}

const MAP_WIDTH = 280;
const MAP_HEIGHT = 520;

const SORE_STROKE = "#ffb020";
const DEFAULT_STROKE = "rgba(120,20,24,0.55)";
const DEFINITION_LINE_COLOR = "rgba(90,10,14,0.4)";

// RadialGradient defaults to objectBoundingBox units, so one shared def per
// state scales its highlight to every differently-shaped path.
function renderDefs(accentColor: string) {
  return (
    <Defs>
      <RadialGradient id='bodyBase' cx='38%' cy='20%' r='85%'>
        <Stop offset='0%' stopColor='#3a3a40' stopOpacity={1} />
        <Stop offset='55%' stopColor='#232327' stopOpacity={1} />
        <Stop offset='100%' stopColor='#141416' stopOpacity={1} />
      </RadialGradient>

      <RadialGradient id='muscleDefault' cx='32%' cy='22%' r='80%'>
        <Stop offset='0%' stopColor='#e8746b' stopOpacity={0.95} />
        <Stop offset='35%' stopColor='#c0342c' stopOpacity={0.92} />
        <Stop offset='75%' stopColor='#8f1f1c' stopOpacity={0.9} />
        <Stop offset='100%' stopColor='#5c0f0f' stopOpacity={0.88} />
      </RadialGradient>

      <RadialGradient id='muscleSore' cx='32%' cy='22%' r='80%'>
        <Stop offset='0%' stopColor='#ffe1ad' stopOpacity={0.95} />
        <Stop offset='35%' stopColor='#ffa93f' stopOpacity={0.92} />
        <Stop offset='75%' stopColor='#e07a12' stopOpacity={0.9} />
        <Stop offset='100%' stopColor='#a3540a' stopOpacity={0.88} />
      </RadialGradient>

      <RadialGradient id='muscleSelected' cx='32%' cy='22%' r='80%'>
        <Stop offset='0%' stopColor='#ffffff' stopOpacity={0.9} />
        <Stop offset='40%' stopColor={accentColor} stopOpacity={0.85} />
        <Stop offset='100%' stopColor={accentColor} stopOpacity={0.55} />
      </RadialGradient>

      <LinearGradient id='glossSheen' x1='0%' y1='0%' x2='100%' y2='100%'>
        <Stop offset='0%' stopColor='#ffffff' stopOpacity={0.12} />
        <Stop offset='30%' stopColor='#ffffff' stopOpacity={0} />
        <Stop offset='100%' stopColor='#ffffff' stopOpacity={0} />
      </LinearGradient>
    </Defs>
  );
}

// All paths are relative to viewBox="0 0 280 520"
const FRONT_MUSCLES: {
  muscle: MuscleGroup;
  path: string;
  labelX: number;
  labelY: number;
}[] = [
  {
    muscle: "neck",
    path: "M 128,18 Q 140,15 152,18 L 150,38 Q 140,42 130,38 Z",
    labelX: 140,
    labelY: 28,
  },
  {
    muscle: "traps",
    path: "M 115,38 Q 130,35 140,38 Q 150,35 165,38 L 175,55 Q 155,58 140,60 Q 125,58 105,55 Z",
    labelX: 140,
    labelY: 48,
  },
  {
    muscle: "shoulders_front",
    path: "M 100,55 Q 88,52 82,62 Q 78,75 85,90 Q 95,85 105,78 Q 110,70 108,58 Z M 180,55 Q 192,52 198,62 Q 202,75 195,90 Q 185,85 175,78 Q 170,70 172,58 Z",
    labelX: 94,
    labelY: 72,
  },
  {
    muscle: "shoulders_side",
    path: "M 82,62 Q 72,65 65,80 Q 58,100 62,120 Q 72,125 80,110 Q 88,95 88,80 Z M 198,62 Q 208,65 215,80 Q 222,100 218,120 Q 208,125 200,110 Q 192,95 192,80 Z",
    labelX: 74,
    labelY: 95,
  },
  {
    muscle: "chest_upper",
    path: "M 108,58 Q 120,55 140,58 Q 160,55 172,58 L 175,78 Q 160,82 140,85 Q 120,82 105,78 Z",
    labelX: 140,
    labelY: 72,
  },
  {
    muscle: "chest_lower",
    path: "M 105,78 Q 120,82 140,85 Q 160,82 175,78 L 178,105 Q 160,112 140,115 Q 120,112 102,105 Z",
    labelX: 140,
    labelY: 97,
  },
  {
    muscle: "biceps",
    path: "M 62,120 Q 55,135 52,155 Q 50,175 55,190 Q 65,195 72,185 Q 78,165 78,145 Q 76,128 68,122 Z M 218,120 Q 225,135 228,155 Q 230,175 225,190 Q 215,195 208,185 Q 202,165 202,145 Q 204,128 212,122 Z",
    labelX: 63,
    labelY: 158,
  },
  {
    muscle: "forearms",
    path: "M 55,190 Q 48,205 45,225 Q 42,250 48,265 Q 58,268 65,255 Q 72,235 72,210 Q 70,196 62,192 Z M 225,190 Q 232,205 235,225 Q 238,250 232,265 Q 222,268 215,255 Q 208,235 208,210 Q 210,196 218,192 Z",
    labelX: 57,
    labelY: 228,
  },
  {
    muscle: "abs_upper",
    path: "M 115,115 Q 125,112 140,115 Q 155,112 165,115 L 168,148 Q 155,152 140,155 Q 125,152 112,148 Z",
    labelX: 140,
    labelY: 134,
  },
  {
    muscle: "abs_lower",
    path: "M 112,148 Q 125,152 140,155 Q 155,152 168,148 L 172,185 Q 155,190 140,192 Q 125,190 108,185 Z",
    labelX: 140,
    labelY: 168,
  },
  {
    muscle: "obliques",
    path: "M 102,105 Q 108,115 112,148 L 108,185 Q 100,182 95,165 Q 92,140 95,120 Z M 178,105 Q 172,115 168,148 L 172,185 Q 180,182 185,165 Q 188,140 185,120 Z",
    labelX: 98,
    labelY: 148,
  },
  {
    muscle: "quads",
    path: "M 108,205 Q 115,200 135,205 L 138,260 Q 125,265 112,262 Z M 172,205 Q 165,200 145,205 L 142,260 Q 155,265 168,262 Z",
    labelX: 123,
    labelY: 232,
  },
  {
    muscle: "adductors",
    path: "M 135,205 Q 140,200 145,205 L 142,260 Q 138,265 135,262 Z M 145,205 Q 140,200 135,205 L 138,260 Q 142,265 145,262 Z",
    labelX: 140,
    labelY: 233,
  },
  {
    muscle: "calves",
    path: "M 108,270 Q 115,265 135,270 L 132,340 Q 120,345 112,340 Z M 172,270 Q 165,265 145,270 L 148,340 Q 160,345 168,340 Z",
    labelX: 121,
    labelY: 305,
  },
  {
    muscle: "hip_flexors",
    path: "M 108,185 Q 115,180 140,183 Q 165,180 172,185 L 172,205 Q 155,208 140,210 Q 125,208 108,205 Z",
    labelX: 140,
    labelY: 195,
  },
];

const FRONT_DEFINITION_LINES: string[] = [
  // neck-to-chest centerline
  "M 140,40 L 140,58",
  // sternum line
  "M 140,58 L 140,105",
  // linea alba (abs center)
  "M 140,115 L 140,192",
  // ab segment 1
  "M 117,134 Q 140,138 163,134",
  // ab segment 2
  "M 115,152 Q 140,156 165,152",
  // ab segment 3
  "M 113,170 Q 140,174 167,170",
  // pec lower separation
  "M 108,80 Q 140,90 172,80",
  // front delt tie-in (left)
  "M 90,58 Q 100,68 100,80",
  // front delt tie-in (right)
  "M 190,58 Q 180,68 180,80",
  // bicep peak (left)
  "M 62,138 Q 68,155 64,172",
  // bicep peak (right)
  "M 218,138 Q 212,155 216,172",
  // quad sweep (left, inner)
  "M 121,210 L 118,258",
  // quad sweep (left/right divider)
  "M 140,208 L 140,258",
  // quad sweep (right, inner)
  "M 159,210 L 162,258",
  // oblique line (left)
  "M 95,110 Q 100,145 97,180",
  // oblique line (right)
  "M 185,110 Q 180,145 183,180",
];

const BACK_MUSCLES: {
  muscle: MuscleGroup;
  path: string;
  labelX: number;
  labelY: number;
}[] = [
  {
    muscle: "neck",
    path: "M 128,18 Q 140,15 152,18 L 150,38 Q 140,42 130,38 Z",
    labelX: 140,
    labelY: 28,
  },
  {
    muscle: "traps",
    path: "M 105,35 Q 120,32 140,35 Q 160,32 175,35 L 190,55 Q 170,58 140,62 Q 110,58 90,55 Z",
    labelX: 140,
    labelY: 48,
  },
  {
    muscle: "shoulders_rear",
    path: "M 88,55 Q 75,52 68,62 Q 62,78 65,95 Q 72,92 82,85 Q 92,75 95,62 Z M 192,55 Q 205,52 212,62 Q 218,78 215,95 Q 208,92 198,85 Q 188,75 185,62 Z",
    labelX: 78,
    labelY: 75,
  },
  {
    muscle: "shoulders_side",
    path: "M 68,62 Q 58,65 52,82 Q 45,105 48,125 Q 58,130 68,115 Q 75,98 75,82 Z M 212,62 Q 222,65 228,82 Q 235,105 232,125 Q 222,130 212,115 Q 205,98 205,82 Z",
    labelX: 60,
    labelY: 96,
  },
  {
    muscle: "shoulders_front",
    path: "M 95,55 Q 88,58 82,62 Q 78,75 85,88 Q 95,82 105,78 Z M 185,55 Q 192,58 198,62 Q 202,75 195,88 Q 185,82 175,78 Z",
    labelX: 92,
    labelY: 72,
  },
  {
    muscle: "lats",
    path: "M 95,90 Q 90,115 88,145 Q 95,165 115,170 Q 135,172 140,175 Q 145,172 165,170 Q 185,165 192,145 Q 190,115 185,90 Q 170,85 140,88 Q 110,85 95,90 Z",
    labelX: 140,
    labelY: 130,
  },
  {
    muscle: "back_upper",
    path: "M 115,58 Q 125,55 140,58 Q 155,55 165,58 L 175,75 Q 160,80 140,82 Q 120,80 105,75 Z",
    labelX: 140,
    labelY: 70,
  },
  {
    muscle: "back_lower",
    path: "M 115,170 Q 130,165 140,168 Q 150,165 165,170 L 168,195 Q 155,200 140,202 Q 125,200 112,195 Z",
    labelX: 140,
    labelY: 186,
  },
  {
    muscle: "triceps",
    path: "M 52,118 Q 45,135 42,155 Q 40,175 45,192 Q 55,195 62,185 Q 68,165 68,145 Q 65,125 58,118 Z M 228,118 Q 235,135 238,155 Q 240,175 235,192 Q 225,195 218,185 Q 212,165 212,145 Q 215,125 222,118 Z",
    labelX: 54,
    labelY: 155,
  },
  {
    muscle: "forearms",
    path: "M 45,192 Q 38,208 35,228 Q 32,252 38,265 Q 48,268 55,255 Q 62,235 62,210 Q 58,196 50,194 Z M 235,192 Q 242,208 245,228 Q 248,252 242,265 Q 232,268 225,255 Q 218,235 218,210 Q 222,196 230,194 Z",
    labelX: 47,
    labelY: 230,
  },
  {
    muscle: "glutes",
    path: "M 112,195 Q 118,190 138,193 Q 142,195 145,198 Q 142,200 138,203 Q 118,206 112,201 Z M 168,195 Q 162,190 142,193 Q 138,195 135,198 Q 138,200 142,203 Q 162,206 168,201 Z",
    labelX: 125,
    labelY: 198,
  },
  {
    muscle: "hamstrings",
    path: "M 115,208 Q 122,205 138,208 L 135,265 Q 122,268 115,265 Z M 165,208 Q 158,205 142,208 L 145,265 Q 158,268 165,265 Z",
    labelX: 125,
    labelY: 236,
  },
  {
    muscle: "abductors",
    path: "M 100,195 Q 105,190 112,195 L 112,210 Q 105,212 100,208 Z M 180,195 Q 175,190 168,195 L 168,210 Q 175,212 180,208 Z",
    labelX: 106,
    labelY: 203,
  },
  {
    muscle: "calves",
    path: "M 110,270 Q 118,265 138,270 L 135,340 Q 122,345 115,340 Z M 170,270 Q 162,265 142,270 L 145,340 Q 158,345 165,340 Z",
    labelX: 123,
    labelY: 305,
  },
  {
    muscle: "lower_back",
    path: "M 125,195 Q 135,192 140,195 Q 145,192 155,195 L 158,208 Q 145,212 140,214 Q 135,212 122,208 Z",
    labelX: 140,
    labelY: 204,
  },
];

const BACK_DEFINITION_LINES: string[] = [
  // spine line
  "M 140,40 L 140,272",
  // trap diamond
  "M 105,55 L 140,80 L 175,55",
  // lat inner sweep (left)
  "M 100,100 Q 118,135 114,168",
  // lat inner sweep (right)
  "M 180,100 Q 162,135 166,168",
  // tricep horseshoe (left)
  "M 55,132 Q 48,155 57,183",
  // tricep horseshoe (right)
  "M 225,132 Q 232,155 223,183",
  // hamstring split (left)
  "M 126,212 L 124,262",
  // hamstring split (right)
  "M 154,212 L 156,262",
  // hamstring center divider
  "M 140,208 L 140,262",
  // glute crease
  "M 128,196 Q 140,200 152,196",
];

function renderBodyOutline() {
  const d =
    "M 140,8 Q 128,8 122,15 Q 118,25 120,35 L 115,40 Q 90,45 72,55 Q 50,70 45,100 Q 40,130 42,160 Q 42,180 45,200 L 48,230 Q 45,280 50,320 Q 55,350 60,370 L 65,390 Q 72,400 80,400 L 90,400 Q 88,380 85,350 Q 82,320 85,280 Q 88,250 92,230 L 105,215 Q 120,210 140,212 Q 160,210 175,215 L 188,230 Q 192,250 195,280 Q 198,320 195,350 Q 192,380 190,400 L 200,400 Q 208,400 215,390 L 220,370 Q 225,350 230,320 Q 235,280 232,230 L 235,200 Q 238,180 238,160 Q 240,130 235,100 Q 230,70 208,55 Q 190,45 165,40 L 160,35 Q 162,25 158,15 Q 152,8 140,8 Z";
  return (
    <>
      <Path
        d={d}
        fill='url(#bodyBase)'
        stroke='rgba(0,0,0,0.6)'
        strokeWidth={1}
      />
      <Path d={d} fill='url(#glossSheen)' stroke='none' />
    </>
  );
}

export default function MuscleMap({
  view,
  selectedMuscles,
  sorenessMap,
  onPressMuscle,
  showLabels = false,
}: MuscleMapProps) {
  const { colors } = useTheme();

  const muscles = view === "front" ? FRONT_MUSCLES : BACK_MUSCLES;
  const definitionLines =
    view === "front" ? FRONT_DEFINITION_LINES : BACK_DEFINITION_LINES;

  return (
    <View style={styles.container}>
      <Svg
        width='100%'
        height={MAP_HEIGHT}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        style={{ maxWidth: MAP_WIDTH }}
      >
        {renderDefs(colors.accent)}
        {renderBodyOutline()}
        {muscles.map(({ muscle, path, labelX, labelY }) => {
          const soreIntensity = sorenessMap[muscle] || 0;
          const isSore = soreIntensity > 0;
          const isSelected = selectedMuscles.has(muscle);

          let fill = "url(#muscleDefault)";
          let strokeColor = DEFAULT_STROKE;

          if (isSore) {
            fill = "url(#muscleSore)";
            strokeColor = SORE_STROKE;
          }
          if (isSelected) {
            fill = "url(#muscleSelected)";
            strokeColor = colors.accent;
          }

          const labelColor = isSore ? SORE_STROKE : "rgba(255,235,235,0.85)";

          return (
            <React.Fragment key={muscle}>
              <Path
                d={path}
                fill={fill}
                stroke={strokeColor}
                strokeWidth={isSelected ? 2.5 : 1.25}
                strokeLinejoin='round'
                onPress={() => onPressMuscle(muscle)}
              />
              {showLabels && (
                <SvgText
                  x={labelX}
                  y={labelY}
                  fill={labelColor}
                  fontSize='6'
                  textAnchor='middle'
                  fontWeight={isSelected ? "bold" : "normal"}
                >
                  {MUSCLE_GROUP_LABELS[muscle]?.split(" ")[0] || muscle}
                </SvgText>
              )}
              {isSore && (
                <SvgText
                  x={labelX}
                  y={labelY - 4}
                  fill={SORE_STROKE}
                  fontSize='7'
                  textAnchor='middle'
                  fontWeight='bold'
                >
                  {soreIntensity}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}
        {definitionLines.map((d) => (
          <Path
            key={`def-${d}`}
            d={d}
            fill='none'
            stroke={DEFINITION_LINE_COLOR}
            strokeWidth={0.7}
            strokeLinecap='round'
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center" },
});
