import React from "react";
import { TextInput } from "react-native";
import { create, act, type ReactTestRenderer } from "react-test-renderer";
import {
  ChangePasswordModal,
  isDeleteConfirmed,
  parseTimeBetweenSets,
} from "../SettingsFormModals";

jest.mock("@shared/context/ThemeContext", () => ({
  useTheme: () => ({ colors: { textMuted: "#999" } }),
}));
jest.mock("@shared/components/ModalSheet", () => {
  const { View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: ({ children, onConfirm }: { children: unknown; onConfirm: () => void }) => (
      <View testID="sheet" onConfirm={onConfirm}>
        {children}
      </View>
    ),
  };
});

const styles = { input: {}, modalDescription: {} };

describe("validators", () => {
  it("accepts 1 to 600 seconds between sets", () => {
    expect(parseTimeBetweenSets("90")).toBe(90);
    expect(parseTimeBetweenSets("600")).toBe(600);
    for (const bad of ["", "0", "601", "abc"]) expect(parseTimeBetweenSets(bad)).toBeNull();
  });

  it("confirms deletion only on the typed word, ignoring case and padding", () => {
    expect(isDeleteConfirmed(" delete ")).toBe(true);
    expect(isDeleteConfirmed("DELET")).toBe(false);
  });
});

describe("ChangePasswordModal", () => {
  const onSubmit = jest.fn();
  const render = (visible: boolean) => (
    <ChangePasswordModal visible={visible} onClose={jest.fn()} onSubmit={onSubmit} styles={styles} />
  );
  const inputs = (tree: ReactTestRenderer) => tree.root.findAllByType(TextInput);

  it("submits what was typed and starts empty the next time it opens", () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(render(true));
    });
    act(() => {
      inputs(tree)[0].props.onChangeText("old-pass1");
      inputs(tree)[1].props.onChangeText("new-pass1");
      inputs(tree)[2].props.onChangeText("new-pass1");
    });
    act(() => tree.root.findByProps({ testID: "sheet" }).props.onConfirm());
    expect(onSubmit).toHaveBeenCalledWith({ current: "old-pass1", next: "new-pass1", confirm: "new-pass1" });

    act(() => tree.update(render(false)));
    act(() => tree.update(render(true)));
    expect(inputs(tree).map((i) => i.props.value)).toEqual(["", "", ""]);
  });
});
