import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { StyleSheet, Text as RNText, TextInput as RNTextInput } from "react-native"
import { DEFAULT_TYPOGRAPHY, Text, TextInput, TypographyContext, type Typography } from "../Text"

function styleOf(typography: Typography, el: React.ReactElement, host: React.ElementType = RNText) {
  let tree!: ReactTestRenderer
  act(() => {
    tree = create(<TypographyContext.Provider value={typography}>{el}</TypographyContext.Provider>)
  })
  return StyleSheet.flatten(tree.root.findByType(host).props.style)
}

describe("Text", () => {
  it("leaves the style alone with the default font and size", () => {
    const style = { fontSize: 10, lineHeight: 20 }
    expect(styleOf(DEFAULT_TYPOGRAPHY, <Text style={style}>x</Text>)).toEqual(style)
  })

  it("applies the font and scales font size and line height", () => {
    expect(styleOf({ font: "serif", scale: 1.3 }, <Text style={{ fontSize: 10, lineHeight: 20 }}>x</Text>)).toEqual({
      fontFamily: "serif",
      fontSize: 13,
      lineHeight: 26,
    })
  })

  it("keeps a font family the style sets itself", () => {
    expect(styleOf({ font: "serif", scale: 1 }, <Text style={{ fontFamily: "monospace" }}>x</Text>).fontFamily).toBe(
      "monospace",
    )
  })

  it("never grows text past its maxFontSizeMultiplier", () => {
    const el = (
      <Text style={{ fontSize: 10 }} maxFontSizeMultiplier={1}>
        x
      </Text>
    )
    expect(styleOf({ font: "default", scale: 1.3 }, el).fontSize).toBe(10)
  })

  it("scales text inputs too", () => {
    expect(styleOf({ font: "mono", scale: 1.15 }, <TextInput style={{ fontSize: 20 }} />, RNTextInput)).toEqual({
      fontFamily: "monospace",
      fontSize: 23,
    })
  })
})
