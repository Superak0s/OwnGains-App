import React from "react";
import { View, Text, TouchableOpacity, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { isDarkColor } from "@utils/color";

interface IntensityPickerStyles {
  readonly container: StyleProp<ViewStyle>;
  readonly button: StyleProp<ViewStyle>;
  readonly buttonText: StyleProp<TextStyle>;
}

interface IntensityPickerProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly getColor: (value: number) => string;
  readonly unselectedBackground: string;
  readonly unselectedBorder?: string;
  readonly unselectedTextColor: string;
  readonly styles: IntensityPickerStyles;
}

export function IntensityPicker({
  value,
  onChange,
  getColor,
  unselectedBackground,
  unselectedBorder,
  unselectedTextColor,
  styles,
}: IntensityPickerProps): React.JSX.Element {
  return (
    <View style={styles.container} accessibilityRole="radiogroup">
      {Array.from({ length: 11 }, (_, level) => {
        const selected = value === level;
        const color = getColor(level);
        const selectedTextColor = isDarkColor(color) ? "#fff" : "#000";
        return (
          <TouchableOpacity
            key={level}
            style={[
              styles.button,
              {
                backgroundColor: selected ? color : unselectedBackground,
                borderColor: selected ? color : (unselectedBorder ?? unselectedBackground),
              },
            ]}
            onPress={() => onChange(level)}
            hitSlop={4}
            accessibilityRole="radio"
            accessibilityLabel={`Level ${level} of 10`}
            accessibilityState={{ selected, checked: selected }}
          >
            <Text
              style={[
                styles.buttonText,
                { color: selected ? selectedTextColor : unselectedTextColor },
              ]}
            >
              {level}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
