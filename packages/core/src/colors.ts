/*
 * Copyright (c) 2023 MKLabs. All rights reserved.
 *
 * NOTICE:  All information contained herein is, and remains the
 * property of MKLabs. The intellectual and technical concepts
 * contained herein are proprietary to MKLabs and may be covered
 * by Republic of Korea and Foreign Patents, patents in process,
 * and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from MKLabs (niklaus.lee@gmail.com).
 */

import {
  gray,
  grayA,
  mauve,
  mauveA,
  slate,
  slateA,
  sage,
  sageA,
  olive,
  oliveA,
  sand,
  sandA,
  tomato,
  tomatoA,
  red,
  redA,
  ruby,
  rubyA,
  crimson,
  crimsonA,
  pink,
  pinkA,
  plum,
  plumA,
  purple,
  purpleA,
  violet,
  violetA,
  iris,
  irisA,
  indigo,
  indigoA,
  blue,
  blueA,
  cyan,
  cyanA,
  teal,
  tealA,
  jade,
  jadeA,
  green,
  greenA,
  grass,
  grassA,
  brown,
  brownA,
  bronze,
  bronzeA,
  gold,
  goldA,
  sky,
  skyA,
  mint,
  mintA,
  lime,
  limeA,
  yellow,
  yellowA,
  amber,
  amberA,
  orange,
  orangeA,
  grayDark,
  grayDarkA,
  mauveDark,
  mauveDarkA,
  slateDark,
  slateDarkA,
  sageDark,
  sageDarkA,
  oliveDark,
  oliveDarkA,
  sandDark,
  sandDarkA,
  tomatoDark,
  tomatoDarkA,
  redDark,
  redDarkA,
  rubyDark,
  rubyDarkA,
  crimsonDark,
  crimsonDarkA,
  pinkDark,
  pinkDarkA,
  plumDark,
  plumDarkA,
  purpleDark,
  purpleDarkA,
  violetDark,
  violetDarkA,
  irisDark,
  irisDarkA,
  indigoDark,
  indigoDarkA,
  blueDark,
  blueDarkA,
  cyanDark,
  cyanDarkA,
  tealDark,
  tealDarkA,
  jadeDark,
  jadeDarkA,
  greenDark,
  greenDarkA,
  grassDark,
  grassDarkA,
  brownDark,
  brownDarkA,
  bronzeDark,
  bronzeDarkA,
  goldDark,
  goldDarkA,
  skyDark,
  skyDarkA,
  mintDark,
  mintDarkA,
  limeDark,
  limeDarkA,
  yellowDark,
  yellowDarkA,
  amberDark,
  amberDarkA,
  orangeDark,
  orangeDarkA,
} from "@radix-ui/colors";

export type Colors = Record<string, string>;

export const themeColors: Record<string, Colors> = {
  light: {
    transparent: "#ffffff00",
    foreground: "#000000",
    background: "#ffffff",
    ...gray,
    ...grayA,
    ...mauve,
    ...mauveA,
    ...slate,
    ...slateA,
    ...sage,
    ...sageA,
    ...olive,
    ...oliveA,
    ...sand,
    ...sandA,
    ...tomato,
    ...tomatoA,
    ...red,
    ...redA,
    ...ruby,
    ...rubyA,
    ...crimson,
    ...crimsonA,
    ...pink,
    ...pinkA,
    ...plum,
    ...plumA,
    ...purple,
    ...purpleA,
    ...violet,
    ...violetA,
    ...iris,
    ...irisA,
    ...indigo,
    ...indigoA,
    ...blue,
    ...blueA,
    ...cyan,
    ...cyanA,
    ...teal,
    ...tealA,
    ...jade,
    ...jadeA,
    ...green,
    ...greenA,
    ...grass,
    ...grassA,
    ...brown,
    ...brownA,
    ...bronze,
    ...bronzeA,
    ...gold,
    ...goldA,
    ...sky,
    ...skyA,
    ...mint,
    ...mintA,
    ...lime,
    ...limeA,
    ...yellow,
    ...yellowA,
    ...amber,
    ...amberA,
    ...orange,
    ...orangeA,
  },
  dark: {
    transparent: "#00000000",
    foreground: "#ffffff",
    background: "#000000",
    ...grayDark,
    ...grayDarkA,
    ...mauveDark,
    ...mauveDarkA,
    ...slateDark,
    ...slateDarkA,
    ...sageDark,
    ...sageDarkA,
    ...oliveDark,
    ...oliveDarkA,
    ...sandDark,
    ...sandDarkA,
    ...tomatoDark,
    ...tomatoDarkA,
    ...redDark,
    ...redDarkA,
    ...rubyDark,
    ...rubyDarkA,
    ...crimsonDark,
    ...crimsonDarkA,
    ...pinkDark,
    ...pinkDarkA,
    ...plumDark,
    ...plumDarkA,
    ...purpleDark,
    ...purpleDarkA,
    ...violetDark,
    ...violetDarkA,
    ...irisDark,
    ...irisDarkA,
    ...indigoDark,
    ...indigoDarkA,
    ...blueDark,
    ...blueDarkA,
    ...cyanDark,
    ...cyanDarkA,
    ...tealDark,
    ...tealDarkA,
    ...jadeDark,
    ...jadeDarkA,
    ...greenDark,
    ...greenDarkA,
    ...grassDark,
    ...grassDarkA,
    ...brownDark,
    ...brownDarkA,
    ...bronzeDark,
    ...bronzeDarkA,
    ...goldDark,
    ...goldDarkA,
    ...skyDark,
    ...skyDarkA,
    ...mintDark,
    ...mintDarkA,
    ...limeDark,
    ...limeDarkA,
    ...yellowDark,
    ...yellowDarkA,
    ...amberDark,
    ...amberDarkA,
    ...orangeDark,
    ...orangeDarkA,
  },
};
