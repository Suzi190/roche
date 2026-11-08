function W(t, a) {
  t -= 251;
  const c = o();
  let d = c[t];
  if (void 0 === W.VeQHSd) {
    const t = function (W, t) {
      let o,
        a,
        c = [],
        d = 0,
        s = "";
      for (
        W = (function (W) {
          let t = "",
            o = "";
          for (
            let a, c, d = 0, s = 0;
            (c = W.charAt(s++));
            ~c && ((a = d % 4 ? 64 * a + c : c), d++ % 4)
              ? (t += String.fromCharCode(255 & (a >> ((-2 * d) & 6))))
              : 0
          )
            c = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=".indexOf(c);
          for (let a = 0, c = t.length; a < c; a++)
            o += "%" + ("00" + t.charCodeAt(a).toString(16)).slice(-2);
          return decodeURIComponent(o);
        })(W),
          a = 0;
        a < 256;
        a++
      )
        c[a] = a;
      for (a = 0; a < 256; a++)
        ((d = (d + c[a] + t.charCodeAt(a % t.length)) % 256), (o = c[a]), (c[a] = c[d]), (c[d] = o));
      ((a = 0), (d = 0));
      for (let n = 0; n < W.length; n++)
        ((a = (a + 1) % 256),
          (d = (d + c[a]) % 256),
          (o = c[a]),
          (c[a] = c[d]),
          (c[d] = o),
          (s += String.fromCharCode(W.charCodeAt(n) ^ c[(c[a] + c[d]) % 256])));
      return s;
    };
    ((W.LOrkXU = t), (W.oSniuh = {}), (W.VeQHSd = !0));
  }
  const s = t + c[0],
    n = W.oSniuh[s];
  return (n ? (d = n) : (void 0 === W.NDDyKr && (W.NDDyKr = !0), (d = W.LOrkXU(d, a)), (W.oSniuh[s] = d)), d);
}
const t = W;
function o() {
  const W = [
    "W5xcTmk+udZcOSo8cSoVW7Cu",
    "n8o9WOn2hcRdS3RcRCktuZW",
    "WPFcMYzHW6ddIeX/cxWBWRFdHa",
    "mSoeydBdLCowkh0zdaFcMSoxW5O",
    "EhRdQaHMW7pcHCkKj8oDhW",
    "WPdcNK/cQSk9WO0ZWOS",
    "BM3dQG9WW6tcLG",
    "W7vrc8kiwvK",
    "W6JdRdfpW4OTESoWzfnDW7FcIa",
    "W63cKeilW5vdAW",
    "tNfuW48ZW4m",
    "dwpdT8otECoSWRddM8o0W6ZdTe8EW5hcKSoD",
    "W5uGnmk+WQm",
    "W43cSgiBW7L/uXnoWRddLvmRDW",
    "W7JdR8oHW5xcM8o/W7SWWQS",
    "WQSdm8ovfbVcUxJdKG",
    "AfeoWR17",
    "lSoiW4tdI8oCy0DcWP4",
    "CSobnmkdW5ftWPLtg8ojW4/dUa",
    "W752W4mJW7tcK2FdMatcHxldMfa",
    "r8oYW6pcQ8knn8o9W4JdNfZcLI1mWQKmWPy",
    "rZhdHM7dH8kL",
    "WRtdH8ocW6u8W60",
    "jepdVta",
    "W4nRA0CnW7z/",
    "W6tcIgevW4FcQNVdIM8xWR3cVW",
    "WQddLYdcSCkYhmoOzmo5W4FdRSo9W6D0WOO",
    "WP4CutKI",
    "pYFcTeSZWRxdLmksj8oKnZyw",
    "nHZcHKyPua",
    "WRjHua",
    "W7TXW4b8jtrdD8kO",
    "BCoth8ktW5O",
    "W4VdJxirWRZcLr9wo1i4WO7dUW/dJ20",
    "W7JdQSoBW7xdR2hdJWdcGCoRWOu",
    "WRbnWOyPiSkAW7GRnq",
    "iCowWO5DuLbXhseMFbtdUa",
    "nHZcLvSYrmkqWPlcIq",
    "W6XHW5y+W7FcHq",
    "cCo4vXRdUq",
    "WRhdKSopW6qS",
    "W6ldQLKtWP7cVZv8mgGgWO/dGcJdSKrUWPS",
    "WOFcKLRcRmk9WOyN",
    "rNfXW48NW4qLWOJcIW",
    "wmoPW7xcGa",
    "W64Wt8kwW6uZWRei",
    "W6f2W7vWjtzyCmkLimoKaG",
    "W7rebmkyq0CEW4KkW6K",
    "W5JcTCo0ncOSW6pdS8kf",
    "W7zabmkyruqS",
    "WQKajCkF",
    "wdVdHwW",
    "WQaaiq",
    "sdVdHN3dLSkJW6S",
    "W6TqgCkvtW",
    "WQ/dQtFcSMVdSKv+W4CVFCoCW40WWQ0a",
    "W5FdHMmMWRNcKHTo",
    "c2pdU8oK",
    "W5ZcUSoVkX09",
    "ymkpWPpcM8k0WPtdUI0NFmolv8o8WQtcO8kW",
    "W43cLmk+qr7cRCoHjCoTW4mfWPCUWPWXWQ9kqSk/WP3cTxmSW6ddLmklWQ3dPmowi0m",
    "WOKCtYyItmoH",
    "DCoDba",
    "s8oZW6JcNmkemmoQ",
    "xCo7pCkNW7f1WQjZi8o/W7hdJCk9WQHIqmkjWO8",
    "W5FcTmoVnru",
    "WO7dGCo+ihe",
    "W7/dU8oxW7hdV2a",
    "WQRcUhaoWPz7l8oc",
    "WO/dMa/dKXRdJW",
    "rdRdJuRdN8kKW7Wcg8ksAmo2g2VdRmkV",
    "cCo4vGJdHCo9guW9",
    "WPpcMKNcRCkX",
    "ytapWRrZs8kVW7m",
    "WP0jusmPwCoXq8od",
    "WRCzjmo/fHxcS3xdRahcS3VcJmoGrSkL",
    "f8o0uHpdOSoH",
    "WRzZz8kQW5iEWROotxmLW5W",
    "DJWAWRjJ",
    "W7zegmkpsq",
    "W55VAKCj",
    "dmo0rWVdV8oNh1W",
    "W7JcRSk9rJJcSW",
    "WQtdRmoJfMZdSCoGm8orW4WjWOW",
    "WOtdNCoPdg/dRfddUaSzWQjSxSo+qSkL",
    "vtjaW6/cMmkesmotW5SormkV",
    "WQLHtmk6W5K",
    "sSo9W6JcGW",
    "W6ycWRBdO8kRWO7dGCoUdSkZWOWZ",
    "W7bebSkjsq",
    "W4xcLmktBrZcJCoxfSouW4SMWRa/W7KN",
    "lbVcOfCYrSklWPxcHmkrsSkI",
    "WQ7dO8oGhwJdTSoJaSouW7CLWRS",
    "WORcKKCZWR5zf8oHyhPiW7FcKGdcLq",
    "W4bHBW",
    "W6WEW501pG",
    "WQTHu8kKW48",
    "WOldLSk3W5lcGq/dQ8kQAq",
    "W7/dSSoNW5dcKa",
    "qdSSCCo6WPnsW4e",
    "W4dcHmoYW4xcNHVdOCkB",
    "WRZcR3yvWO0",
    "W5ddLmo9W5NcTSo0W7S1WRKJCYO4WRBdJmonBwddJSoIC8kHW67dGW9cbq",
    "W5VdIqRdRmoHW5uyWOldPSkDW5JcOq",
    "WRRcVmkcWRZcVYpdNtpcVCo4WQW3",
    "W4FcPea5W7i",
    "ESkNWOfSWRz7urvG",
    "WRbUrCkmW5asWQSeFN8LW6HHj8o3vq",
    "W4xdGgm7WQBcMsHChG",
    "tSkCWQTmWRzkyILBFJ3cQmkMWOusW7e",
    "ju4MWOpdOmoRA8ogW50PqCk0j8oE",
    "WQWEnCoqhW",
    "WP/dHWNcLv0",
    "W5ldNdtdUhPbW5PXW4ddJCk0WO3dUqBdHXi",
    "W5ddGMq5WQm",
    "c37dHmo5zSoSWRhdNmow",
    "W5RcHSk1DNBdSfJdSqK5",
    "WQLPrCk4W68pWQKmuG",
    "AY3dLxPjxSoWWQG",
    "WRz6k8o0",
    "WOKyts81x8oStmouka",
    "5RAq6kEi5zMi",
    "ACkFWP7dJCow",
    "W5mOi8k6WPu7WQ5+W58",
    "xmoUW6/cHq",
    "pSo5W5CPW5q/wanCzbVcMW",
    "5lMJ6zsV55wR5OUg",
    "exNdOmo5E8oIWRRdLSok",
    "WPJdTW/cMCkpoSoq",
    "W6GiW7yZi8kDW54z",
    "F3RdSqXQW6/cG8kJ",
    "fhKXr8or",
    "WQRcQxytWPfYiCoxsW",
    "W6CuWPmaW6GOWQC4W6pcQMrX",
    "AhddQX0",
    "WOxcIMhcGImFW5jEW5xdM8kFWPW",
    "BCkFWPZdNmoCyebaWR7cVa",
    "WO7cLf/cU8k4",
    "W7TGW4zHiJ1nyG",
    "D8oxhCkbW4TE",
    "W5NcNuldH1VdLxDdW5i4",
    "W6WgWROo",
    "WPtcIfCZWRXkgmoJFxnhW7lcMXy",
    "C14yWPvKWORcQmknW43dISobywXVrSok",
    "W7CsW5q/iSk1W5Omd8kMW7rKxW",
    "W78iW5KyiCklW6ldQmoojmkY",
    "WR0ai8kjfa",
    "W4PxW71cgbz4tSkbg8ofiZO6WQtdJW",
    "WPpcLeS",
    "xgDtW5i9W4mGWPC",
    "WPVdTXxcICkpoSoqrW",
    "FmkIW4e",
    "pKNdOJtdUa",
    "W4lcR8o8na06",
    "W7ZdQSoyW6hdO33dIq",
    "W7X6W5K+W6pcLvddVG4",
    "E8kaWOxcS8kR",
    "WP0yvZ4Uumo/vG",
    "awOXw8og",
  ];
  return (o = function () {
    return W;
  })();
}
!(function () {
  const t = W,
    a = o();
  for (;;)
    try {
      if (
        242387 ===
        parseInt(t(397, "mUni")) / 1 +
          (-parseInt(t(331, "*@Yf")) / 2) * (parseInt(t(295, "5Pyx")) / 3) +
          -parseInt(t(315, "jqBM")) / 4 +
          (parseInt(t(359, "hZRO")) / 5) * (-parseInt(t(350, "DzrW")) / 6) +
          -parseInt(t(290, "6p3A")) / 7 +
          -parseInt(t(316, "xbjx")) / 8 +
          (-parseInt(t(252, "KtGy")) / 9) * (-parseInt(t(399, "uL%^")) / 10)
      )
        break;
      a.push(a.shift());
    } catch (c) {
      a.push(a.shift());
    }
})();
import { f as a, D as c, p as d } from "./db-layer-CDcFHN6B.js";
import {
  bY as s,
  aD as n,
  aC as e,
  bZ as i,
  b_ as m,
  b$ as r,
  aK as k,
  c0 as S,
  aI as C,
  c1 as R,
  u as O,
} from "./ai-core-BB-N4fjb.js";
import { b as u } from "./vue-vendor--2_S-kdx.js";
const p = u({
    viewStack: [],
    activeContact: null,
    videoAppState: { activeTab: t(307, "mQ#4") },
    oneClickGenState: { isGenerating: !1, contactId: null, tasks: [] },
  }),
  f = (W, o = {}) => {
    const a = t;
    p[a(385, "me0h")][a(358, "(^Pr")]({ name: W, params: o });
  },
  w = () => {
    const W = t;
    p[W(278, "Gi7Z")][W(294, "9$D5")] > 1 && p[W(261, "602j")][W(303, "i1Qt")]();
  },
  J = () => {
    const W = t;
    ((p[W(272, "hZRO")] = [{ name: W(314, "mUni"), params: {} }]),
      (p[W(333, "^mZx")] = null),
      (p[W(299, "#XH2")][W(263, "xbjx")] = W(267, "5Pyx")));
  },
  Q = async (W, o) => {
    const a = t;
    p[a(347, "xbjx")][a(405, "dcbg")] ||
      ((p[a(373, "%AGK")][a(310, "^mZx")] = W),
      (p[a(298, "*$Jq")][a(360, "h#4Q")] = !0),
      (p[a(268, "6p3A")][a(251, "hZRO")] = o[a(344, "hZRO")]((W) => ({
        id: W,
        name: P(W),
        status: a(363, "io6%"),
      }))),
      b(W));
  },
  h = () => {
    const W = t;
    ((p[W(398, "NUqe")][W(332, "9$D5")] = !1),
      p[W(262, "hZRO")][W(330, "*$Jq")][W(323, "BMuk")]((t) => {
        const o = W;
        t[o(343, "dcbg")] === o(309, "f2w^") && (t[o(308, "p4Nm")] = o(286, "bJEg"));
      }));
  },
  P = (W) => {
    const o = t;
    return (
      {
        memo: "需办",
        diary: "日记",
        sms: "短信",
        music: "音乐",
        video: "视频",
        market: "购物",
        bank: "余额",
        gallery: "相册",
        forum: "论坛",
        browser: o(276, "hZRO"),
        auto_awesome: o(281, "uL%^"),
      }[W] || W
    );
  },
  y = t(383, "5Pyx"),
  x = async () => {
    const W = t,
      o = O();
    !o[W(362, "p4Nm")][W(277, "*@Yf")] && (await o[W(371, "KsfW")]());
    const a = String(o[W(292, "i1Qt")][W(400, "hZRO")] || "")[W(279, "(^Pr")]() || y,
      c =
        typeof o[W(348, "f2w^")][W(354, "ABtH")] === W(396, "mUni")
          ? o[W(318, "3!gt")][W(403, "io6%")]
          : Number(o[W(300, "mR4s")][W(346, "9$D5")]);
    return { model: a, temperature: Number[W(284, "#XH2")](c) ? c : 0.7 };
  },
  b = async (W) => {
    const o = t;
    for (const t of p[o(325, "KsfW")][o(311, "%AGK")]) {
      if (!p[o(389, "m4gd")][o(391, "hZRO")]) break;
      if (t[o(381, "f2w^")] === o(283, "prYM")) {
        t[o(352, "^mZx")] = o(275, "^FfJ");
        try {
          switch (t.id) {
            case o(320, "3!gt"):
              await l(W);
              break;
            case o(353, "me0h"):
              await K(W);
              break;
            case o(368, "io6%"):
              await N(W);
              break;
            case o(372, "p4Nm"):
              !p[o(384, "jep9")][o(269, "xbjx")][o(365, "jep9")]((W) => W.id === o(401, "(^Pr")) &&
                (await H(W));
              break;
            case o(296, "MtKd"):
              await H(W);
              break;
            case o(379, "p4Nm"):
              await Z(W);
              break;
            case o(390, "me0h"):
              await g(W);
              break;
            case o(375, "^FfJ"):
              await I(W);
              break;
            case o(337, "mQ#4"):
              await j(W);
              break;
            case o(392, ")1ge"):
              await q(W);
              break;
            case o(306, "jqBM"):
              await G(W);
          }
          t[o(336, "ABtH")] = o(289, "3!gt");
        } catch (a) {
          t[o(321, "io6%")] = o(256, "RZIP");
        }
      }
    }
    p[o(334, "(^Pr")][o(288, "MtKd")] = !1;
  },
  l = async (W) => {
    const o = t;
    let s = { historyCount: 6, keywordCount: 4 };
    const n = await a(c[o(302, "h#4Q")], W);
    n?.[o(293, "h#4Q")] && (s = n[o(370, "xbjx")]);
    const e = await R(W, s);
    e && (await d(c[o(264, "602j")], JSON[o(341, "^FfJ")](JSON[o(345, "h#4Q")](e))));
  },
  K = async (W) => {
    const o = t;
    let s = {
      worksCount: 5,
      likesCount: 4,
      commentsCount: 3,
      timeAwareness: !0,
    };
    const n = await a(c[o(404, "mUni")], W);
    n?.[o(395, "me0h")] && (s = n[o(382, "RZIP")]);
    const e = await C(W, s);
    e && (await d(c[o(407, "RZIP")], JSON[o(301, "BppX")](JSON[o(388, "^FfJ")](e))));
  },
  N = async (W) => {
    const o = t;
    let s = {
      latestSongsCount: 3,
      playlistsCount: 2,
      podcastsCount: 2,
      notesCount: 5,
      timeAwareness: !0,
    };
    const n = await a(c[o(317, "me0h")], W);
    n?.[o(387, ")1ge")] && (s = n[o(255, "KtGy")]);
    const e = await S(W, s);
    e && (await d(c[o(297, "RZIP")], JSON[o(260, "5fKp")](JSON[o(351, "dcbg")](e))));
  },
  H = async (W) => {
    const o = t;
    let s = { cartCount: 3, ordersCount: 2, transactionsCount: 5 };
    const n = await a(c[o(378, "9$D5")], W);
    n?.[o(304, "Fl)c")] && (s = n[o(285, "3!gt")]);
    const e = await k(W, s);
    e && (await d(c[o(355, "xbjx")], JSON[o(326, "Gi7Z")](JSON[o(287, "RZIP")](e))));
  },
  Z = async (W) => {
    const o = t;
    let s = { charPostsCount: 3, npcPostsCount: 2, commentsCount: 3 };
    const n = await a(c[o(265, "uL%^")], W);
    n?.[o(312, "^FfJ")] && (s = n[o(273, "14vj")]);
    const e = await r(W, s);
    e && (await d(c[o(327, "BMuk")], JSON[o(386, "i1Qt")](JSON[o(287, "RZIP")](e))));
  },
  g = async (W) => {
    const o = t,
      a = await m(W);
    a && (await d(c[o(340, "prYM")], JSON[o(393, "io6%")](JSON[o(329, "m4gd")](a))));
  },
  I = async (W) => {
    const o = t,
      a = await i(W);
    a && (await d(c[o(369, "5Pyx")], JSON[o(313, "bJEg")](JSON[o(328, "voEO")](a))));
  },
  j = async (W) => {
    const o = t,
      { model: a, temperature: c } = await x(),
      s = await e(W, 3, a, c);
    if (s && s[o(335, "jep9")] > 0) {
      const t = s[o(366, "BppX")]((t) => ({
        id: crypto[o(291, "*@Yf")](),
        contactId: W,
        date: t[o(364, "BppX")],
        title: t[o(253, "voEO")],
        content: t[o(367, "jep9")],
        timestamp: Date[o(408, "vQIc")](),
      }));
      for (const W of t) await d(o(409, "#XH2"), W);
    }
  },
  q = async (W) => {
    const o = t,
      { model: a, temperature: c } = await x(),
      s = await n(W, a, c);
    s &&
      (await d(o(356, "i1Qt"), {
        id: crypto[o(361, "io6%")](),
        contactId: W,
        title: s[o(266, "m4gd")],
        content: s[o(377, "(^Pr")],
        date: s[o(364, "BppX")],
        timestamp: Date[o(376, "9$D5")](),
        pinned: !1,
      }));
  },
  G = async (W) => {
    const o = t;
    let n = { conversationsCount: 3, messagesCount: 5 };
    const e = await a(c[o(402, "inBR")], W);
    e?.[o(305, "prYM")] && (n = e[o(319, "i1Qt")]);
    const i = await s(W, n);
    (i && Object[o(324, "Fl)c")](i, { settings: n }),
      i && (await d(c[o(339, "5fKp")], JSON[o(394, "vQIc")](JSON[o(282, "KsfW")](i)))));
  },
  L = u({ isVisible: !1, message: "" }),
  M = (W) => {
    const o = t;
    ((L[o(338, "vQIc")] = W), (L[o(270, "KsfW")] = !0));
  },
  v = () => {
    L[t(357, "Fl)c")] = !1;
  };
export { w as a, M as b, Q as c, h as d, L as g, v as h, f as n, J as r, p as s };
