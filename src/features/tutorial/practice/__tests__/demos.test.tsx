import { create, act, type ReactTestRenderer, type ReactTestInstance } from "react-test-renderer";
import { Switch, TouchableOpacity, TextInput } from "react-native";

jest.mock("@shared/context/ThemeContext", () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => "#000000" }) }),
}));
const mockAlert = jest.fn();
jest.mock("@shared/components/CustomAlert", () => ({
  useAlert: () => ({ alert: mockAlert, AlertComponent: null }),
}));
jest.mock("../../motion", () => ({ Hand: () => null, PulseRing: () => null }));

import { Checklist, FriendRequestDemo, LogSetDemo, PermissionsDemo } from "../demos";

const render = (el: React.ReactElement) => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(el);
  });
  return tree;
};

const press = (root: ReactTestInstance, label: string) =>
  act(() => {
    root.findAll((n) => n.type === TouchableOpacity && n.props.accessibilityLabel === label)[0].props.onPress();
  });

const toggle = (root: ReactTestInstance, label: string, on: boolean) =>
  act(() => {
    root.findAll((n) => n.type === Switch && n.props.accessibilityLabel === label)[0].props.onValueChange(on);
  });

beforeEach(() => jest.clearAllMocks());

it("checklist completes once every item is tapped", () => {
  const onComplete = jest.fn();
  const tree = render(
    <Checklist onComplete={onComplete} items={[{ icon: "a", label: "One", result: "r1" }, { icon: "b", label: "Two", result: "r2" }]} />,
  );
  press(tree.root, "One");
  press(tree.root, "One");
  expect(onComplete).not.toHaveBeenCalled();
  press(tree.root, "Two");
  expect(onComplete).toHaveBeenCalledTimes(1);
});

it("log-set demo saves only with weight and reps, and Use it fills them", () => {
  const onComplete = jest.fn();
  const tree = render(<LogSetDemo onComplete={onComplete} />);
  press(tree.root, "Save set");
  expect(onComplete).not.toHaveBeenCalled();
  press(tree.root, "Use last time: 60 kilograms for 8 reps");
  const [weight] = tree.root.findAllByType(TextInput);
  expect(weight.props.value).toBe("60");
  press(tree.root, "Save set");
  expect(onComplete).toHaveBeenCalled();
});

it("permissions demo asks before granting Trainer Access and completes after a revoke", () => {
  const onComplete = jest.fn();
  const tree = render(<PermissionsDemo onComplete={onComplete} />);
  toggle(tree.root, "Trainer Access for Alex", true);
  expect(mockAlert).toHaveBeenCalledWith("Make Alex your trainer?", expect.any(String), expect.any(Array), "warning");
  act(() => mockAlert.mock.calls[0][2][1].onPress());
  expect(onComplete).not.toHaveBeenCalled();
  toggle(tree.root, "Trainer Access for Alex", false);
  expect(onComplete).toHaveBeenCalled();
});

it("permissions demo turns on History Access along with Analytics", () => {
  const tree = render(<PermissionsDemo onComplete={jest.fn()} />);
  toggle(tree.root, "Analytics Access for Alex", true);
  const isOn = (label: string) =>
    tree.root.findAll((n) => n.type === Switch && n.props.accessibilityLabel === label)[0].props.value;
  expect(isOn("Analytics Access for Alex")).toBe(true);
  expect(isOn("History Access for Alex")).toBe(true);
});

it("friend request completes on accept, not on decline", () => {
  const onComplete = jest.fn();
  const tree = render(<FriendRequestDemo onComplete={onComplete} />);
  press(tree.root, "Decline Alex's friend request");
  expect(onComplete).not.toHaveBeenCalled();
  press(tree.root, "Try again");
  press(tree.root, "Accept Alex's friend request");
  expect(onComplete).toHaveBeenCalled();
});
