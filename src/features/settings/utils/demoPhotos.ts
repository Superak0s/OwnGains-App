import type { RecoveryMuscleGroup } from "@shared/types";

// Black placeholders naming the muscle, one font per photo so they tell apart when compared.
export const DEMO_PHOTOS: {
  muscle: RecoveryMuscleGroup;
  angle: "front" | "back" | "side";
  images: number[];
}[] = [
  {
    muscle: "chest_upper",
    angle: "front",
    images: [
      require("../../../../assets/demo-photos/chest_upper-1.jpg"),
      require("../../../../assets/demo-photos/chest_upper-2.jpg"),
      require("../../../../assets/demo-photos/chest_upper-3.jpg"),
    ],
  },
  {
    muscle: "lats",
    angle: "back",
    images: [
      require("../../../../assets/demo-photos/lats-1.jpg"),
      require("../../../../assets/demo-photos/lats-2.jpg"),
      require("../../../../assets/demo-photos/lats-3.jpg"),
    ],
  },
  {
    muscle: "shoulders_side",
    angle: "side",
    images: [
      require("../../../../assets/demo-photos/shoulders_side-1.jpg"),
      require("../../../../assets/demo-photos/shoulders_side-2.jpg"),
      require("../../../../assets/demo-photos/shoulders_side-3.jpg"),
    ],
  },
  {
    muscle: "biceps",
    angle: "front",
    images: [
      require("../../../../assets/demo-photos/biceps-1.jpg"),
      require("../../../../assets/demo-photos/biceps-2.jpg"),
      require("../../../../assets/demo-photos/biceps-3.jpg"),
    ],
  },
  {
    muscle: "triceps",
    angle: "back",
    images: [
      require("../../../../assets/demo-photos/triceps-1.jpg"),
      require("../../../../assets/demo-photos/triceps-2.jpg"),
      require("../../../../assets/demo-photos/triceps-3.jpg"),
    ],
  },
  {
    muscle: "abs_upper",
    angle: "front",
    images: [
      require("../../../../assets/demo-photos/abs_upper-1.jpg"),
      require("../../../../assets/demo-photos/abs_upper-2.jpg"),
      require("../../../../assets/demo-photos/abs_upper-3.jpg"),
    ],
  },
  {
    muscle: "quads",
    angle: "front",
    images: [
      require("../../../../assets/demo-photos/quads-1.jpg"),
      require("../../../../assets/demo-photos/quads-2.jpg"),
      require("../../../../assets/demo-photos/quads-3.jpg"),
    ],
  },
  {
    muscle: "hamstrings",
    angle: "back",
    images: [
      require("../../../../assets/demo-photos/hamstrings-1.jpg"),
      require("../../../../assets/demo-photos/hamstrings-2.jpg"),
      require("../../../../assets/demo-photos/hamstrings-3.jpg"),
    ],
  },
  {
    muscle: "glutes",
    angle: "back",
    images: [
      require("../../../../assets/demo-photos/glutes-1.jpg"),
      require("../../../../assets/demo-photos/glutes-2.jpg"),
      require("../../../../assets/demo-photos/glutes-3.jpg"),
    ],
  },
  {
    muscle: "calves",
    angle: "side",
    images: [
      require("../../../../assets/demo-photos/calves-1.jpg"),
      require("../../../../assets/demo-photos/calves-2.jpg"),
      require("../../../../assets/demo-photos/calves-3.jpg"),
    ],
  },
];
