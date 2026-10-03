/**
 * The exercise database has no plain "Squat" or "Bench Press" entry. The closest
 * names by token overlap are variants like "Squats - With Bands", which the
 * matcher deliberately refuses to auto-accept. Without these hand-mapped
 * aliases the most common lifts in every program would all end up in review.
 */
export const EXERCISE_ALIASES: Record<string, string> = {
  squat: "Barbell_Squat",
  "back squat": "Barbell_Squat",
  "barbell squat": "Barbell_Squat",
  "front squat": "Front_Squat_Clean_Grip",
  "bodyweight squat": "Bodyweight_Squat",
  "air squat": "Bodyweight_Squat",
  "hack squat": "Barbell_Hack_Squat",

  "bench press": "Barbell_Bench_Press_-_Medium_Grip",
  "flat bench press": "Barbell_Bench_Press_-_Medium_Grip",
  "barbell bench press": "Barbell_Bench_Press_-_Medium_Grip",
  "incline bench press": "Barbell_Incline_Bench_Press_-_Medium_Grip",
  "close grip bench press": "Close-Grip_Barbell_Bench_Press",
  "dumbbell bench press": "Dumbbell_Bench_Press",
  "incline dumbbell press": "Incline_Dumbbell_Press",
  "incline dumbbell bench press": "Incline_Dumbbell_Press",

  deadlift: "Barbell_Deadlift",
  "conventional deadlift": "Barbell_Deadlift",
  "barbell deadlift": "Barbell_Deadlift",
  "romanian deadlift": "Romanian_Deadlift",

  "overhead press": "Standing_Military_Press",
  "military press": "Standing_Military_Press",
  "standing overhead press": "Standing_Military_Press",
  "barbell shoulder press": "Barbell_Shoulder_Press",
  "dumbbell shoulder press": "Dumbbell_Shoulder_Press",

  "lateral raise": "Side_Lateral_Raise",
  "side lateral raise": "Side_Lateral_Raise",
  "dumbbell lateral raise": "Side_Lateral_Raise",

  "bicep curl": "Barbell_Curl",
  "barbell curl": "Barbell_Curl",
  "preacher curl": "Preacher_Curl",
  "hammer curl": "Hammer_Curls",

  "tricep pushdown": "Triceps_Pushdown",
  "tricep extension": "Triceps_Pushdown",
  skullcrusher: "EZ-Bar_Skullcrusher",
  "skull crusher": "EZ-Bar_Skullcrusher",

  "lat pulldown": "Wide-Grip_Lat_Pulldown",
  "pulldown": "Wide-Grip_Lat_Pulldown",
  "pull up": "Pullups",
  "pull ups": "Pullups",
  pullup: "Pullups",
  "chin up": "Chin-Up",
  "barbell row": "Bent_Over_Barbell_Row",
  "bent over row": "Bent_Over_Barbell_Row",
  "dumbbell row": "One-Arm_Dumbbell_Row",
  "seated row": "Seated_Cable_Rows",
  "seated cable row": "Seated_Cable_Rows",
  "face pull": "Face_Pull",
  shrug: "Barbell_Shrug",
  "dumbbell shrug": "Dumbbell_Shrug",

  "leg press": "Leg_Press",
  "leg extension": "Leg_Extensions",
  "leg curl": "Lying_Leg_Curls",
  "calf raise": "Standing_Calf_Raises",
  "hip thrust": "Barbell_Hip_Thrust",
  lunge: "Barbell_Lunge",
  "good morning": "Good_Morning",
  "back extension": "Hyperextensions_Back_Extensions",
  hyperextension: "Hyperextensions_Back_Extensions",

  "chest fly": "Dumbbell_Flyes",
  "dumbbell fly": "Dumbbell_Flyes",
  "cable fly": "Cable_Crossover",
  "cable crossover": "Cable_Crossover",
  "push up": "Pushups",
  "push ups": "Pushups",
  pushup: "Pushups",
  dip: "Dips_-_Triceps_Version",
  dips: "Dips_-_Triceps_Version",
  plank: "Plank",
  crunch: "Crunches",

  // Gym machines the dataset names after the movement or the manufacturer
  // style ("Thigh Abductor", "Dip Machine") rather than the plate on the wall.
  "hip abduction": "Thigh_Abductor",
  "hip abductor": "Thigh_Abductor",
  "hip adduction": "Thigh_Adductor",
  "hip adductor": "Thigh_Adductor",
  "assisted dip": "Dip_Machine",
  "assisted dips": "Dip_Machine",
  "assisted pullup": "Band_Assisted_Pull-Up",
  "assisted pull up": "Band_Assisted_Pull-Up",
  "rear kick machine": "Glute_Kickback",
  "glute kickback": "Glute_Kickback",
  "seated chest press": "Leverage_Chest_Press",
  "incline chest press": "Leverage_Incline_Chest_Press",
  "reverse curl": "Reverse_Barbell_Curl",
  "dumbbell curl": "Dumbbell_Bicep_Curl",
  "machine lateral raise": "Side_Lateral_Raise",
};
