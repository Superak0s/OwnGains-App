import { requireOptionalNativeModule } from "expo";

interface AutofillModule {
  commit(): void;
}

const Autofill = requireOptionalNativeModule<AutofillModule>("Autofill");

export function commitAutofill(): void {
  Autofill?.commit();
}
