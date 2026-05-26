/**
 * Canonical language list aligned with Google Cloud Translation Hub NMT languages.
 * Source: https://cloud.google.com/translation-hub/docs/supported-languages
 * Count: 194 languages (matches Google's published NMT list).
 */
const REFERENCE_LANGUAGES = [
  {
    "code": "ab",
    "name": "Abkhaz",
    "sort_order": 1000
  },
  {
    "code": "ace",
    "name": "Acehnese",
    "sort_order": 1001
  },
  {
    "code": "ach",
    "name": "Acholi",
    "sort_order": 1002
  },
  {
    "code": "af",
    "name": "Afrikaans",
    "sort_order": 1003
  },
  {
    "code": "sq",
    "name": "Albanian",
    "sort_order": 1004
  },
  {
    "code": "alz",
    "name": "Alur",
    "sort_order": 1005
  },
  {
    "code": "am",
    "name": "Amharic",
    "sort_order": 1006
  },
  {
    "code": "ar",
    "name": "Arabic",
    "sort_order": 100
  },
  {
    "code": "hy",
    "name": "Armenian",
    "sort_order": 1008
  },
  {
    "code": "as",
    "name": "Assamese",
    "sort_order": 1009
  },
  {
    "code": "awa",
    "name": "Awadhi",
    "sort_order": 1010
  },
  {
    "code": "ay",
    "name": "Aymara",
    "sort_order": 1011
  },
  {
    "code": "az",
    "name": "Azerbaijani",
    "sort_order": 1012
  },
  {
    "code": "ban",
    "name": "Balinese",
    "sort_order": 1013
  },
  {
    "code": "bm",
    "name": "Bambara",
    "sort_order": 1014
  },
  {
    "code": "ba",
    "name": "Bashkir",
    "sort_order": 1015
  },
  {
    "code": "eu",
    "name": "Basque",
    "sort_order": 1016
  },
  {
    "code": "btx",
    "name": "Batak Karo",
    "sort_order": 1017
  },
  {
    "code": "bts",
    "name": "Batak Simalungun",
    "sort_order": 1018
  },
  {
    "code": "bbc",
    "name": "Batak Toba",
    "sort_order": 1019
  },
  {
    "code": "be",
    "name": "Belarusian",
    "sort_order": 1020
  },
  {
    "code": "bem",
    "name": "Bemba",
    "sort_order": 1021
  },
  {
    "code": "bn",
    "name": "Bengali",
    "sort_order": 1022
  },
  {
    "code": "bew",
    "name": "Betawi",
    "sort_order": 1023
  },
  {
    "code": "bho",
    "name": "Bhojpuri",
    "sort_order": 1024
  },
  {
    "code": "bik",
    "name": "Bikol",
    "sort_order": 1025
  },
  {
    "code": "bs",
    "name": "Bosnian",
    "sort_order": 1026
  },
  {
    "code": "br",
    "name": "Breton",
    "sort_order": 1027
  },
  {
    "code": "bg",
    "name": "Bulgarian",
    "sort_order": 1028
  },
  {
    "code": "bua",
    "name": "Buryat",
    "sort_order": 1029
  },
  {
    "code": "yue",
    "name": "Cantonese",
    "sort_order": 140
  },
  {
    "code": "ca",
    "name": "Catalan",
    "sort_order": 1031
  },
  {
    "code": "ceb",
    "name": "Cebuano",
    "sort_order": 1032
  },
  {
    "code": "ny",
    "name": "Chichewa (Nyanja)",
    "sort_order": 1033
  },
  {
    "code": "zh-CN",
    "name": "Chinese (Simplified)",
    "sort_order": 60
  },
  {
    "code": "zh-TW",
    "name": "Chinese (Traditional)",
    "sort_order": 70
  },
  {
    "code": "cv",
    "name": "Chuvash",
    "sort_order": 1036
  },
  {
    "code": "co",
    "name": "Corsican",
    "sort_order": 1037
  },
  {
    "code": "crh",
    "name": "Crimean Tatar",
    "sort_order": 1038
  },
  {
    "code": "hr",
    "name": "Croatian",
    "sort_order": 1039
  },
  {
    "code": "cs",
    "name": "Czech",
    "sort_order": 1040
  },
  {
    "code": "da",
    "name": "Danish",
    "sort_order": 1041
  },
  {
    "code": "din",
    "name": "Dinka",
    "sort_order": 1042
  },
  {
    "code": "dv",
    "name": "Divehi",
    "sort_order": 1043
  },
  {
    "code": "doi",
    "name": "Dogri",
    "sort_order": 1044
  },
  {
    "code": "dov",
    "name": "Dombe",
    "sort_order": 1045
  },
  {
    "code": "nl",
    "name": "Dutch",
    "sort_order": 1046
  },
  {
    "code": "dz",
    "name": "Dzongkha",
    "sort_order": 1047
  },
  {
    "code": "en",
    "name": "English",
    "sort_order": 0
  },
  {
    "code": "eo",
    "name": "Esperanto",
    "sort_order": 1049
  },
  {
    "code": "et",
    "name": "Estonian",
    "sort_order": 1050
  },
  {
    "code": "ee",
    "name": "Ewe",
    "sort_order": 1051
  },
  {
    "code": "fj",
    "name": "Fijian",
    "sort_order": 1052
  },
  {
    "code": "fil",
    "name": "Filipino (Tagalog)",
    "sort_order": 1053
  },
  {
    "code": "fi",
    "name": "Finnish",
    "sort_order": 1054
  },
  {
    "code": "fr",
    "name": "French",
    "sort_order": 20
  },
  {
    "code": "fr-FR",
    "name": "French (French)",
    "sort_order": 1056
  },
  {
    "code": "fr-CA",
    "name": "French (Canadian)",
    "sort_order": 1057
  },
  {
    "code": "fy",
    "name": "Frisian",
    "sort_order": 1058
  },
  {
    "code": "ff",
    "name": "Fulfulde",
    "sort_order": 1059
  },
  {
    "code": "gaa",
    "name": "Ga",
    "sort_order": 1060
  },
  {
    "code": "gl",
    "name": "Galician",
    "sort_order": 1061
  },
  {
    "code": "lg",
    "name": "Ganda (Luganda)",
    "sort_order": 1062
  },
  {
    "code": "ka",
    "name": "Georgian",
    "sort_order": 1063
  },
  {
    "code": "de",
    "name": "German",
    "sort_order": 30
  },
  {
    "code": "el",
    "name": "Greek",
    "sort_order": 1065
  },
  {
    "code": "gn",
    "name": "Guarani",
    "sort_order": 1066
  },
  {
    "code": "gu",
    "name": "Gujarati",
    "sort_order": 1067
  },
  {
    "code": "ht",
    "name": "Haitian Creole",
    "sort_order": 1068
  },
  {
    "code": "cnh",
    "name": "Hakha Chin",
    "sort_order": 1069
  },
  {
    "code": "ha",
    "name": "Hausa",
    "sort_order": 1070
  },
  {
    "code": "haw",
    "name": "Hawaiian",
    "sort_order": 1071
  },
  {
    "code": "he",
    "name": "Hebrew",
    "sort_order": 1072
  },
  {
    "code": "hil",
    "name": "Hiligaynon",
    "sort_order": 1073
  },
  {
    "code": "hi",
    "name": "Hindi",
    "sort_order": 110
  },
  {
    "code": "hmn",
    "name": "Hmong",
    "sort_order": 1075
  },
  {
    "code": "hu",
    "name": "Hungarian",
    "sort_order": 1076
  },
  {
    "code": "hrx",
    "name": "Hunsrik",
    "sort_order": 1077
  },
  {
    "code": "is",
    "name": "Icelandic",
    "sort_order": 1078
  },
  {
    "code": "ig",
    "name": "Igbo",
    "sort_order": 1079
  },
  {
    "code": "ilo",
    "name": "Iloko",
    "sort_order": 1080
  },
  {
    "code": "id",
    "name": "Indonesian",
    "sort_order": 1081
  },
  {
    "code": "ga",
    "name": "Irish",
    "sort_order": 1082
  },
  {
    "code": "it",
    "name": "Italian",
    "sort_order": 40
  },
  {
    "code": "ja",
    "name": "Japanese",
    "sort_order": 80
  },
  {
    "code": "jv",
    "name": "Javanese",
    "sort_order": 1085
  },
  {
    "code": "kn",
    "name": "Kannada",
    "sort_order": 1086
  },
  {
    "code": "pam",
    "name": "Kapampangan",
    "sort_order": 1087
  },
  {
    "code": "kk",
    "name": "Kazakh",
    "sort_order": 1088
  },
  {
    "code": "km",
    "name": "Khmer",
    "sort_order": 1089
  },
  {
    "code": "cgg",
    "name": "Kiga",
    "sort_order": 1090
  },
  {
    "code": "rw",
    "name": "Kinyarwanda",
    "sort_order": 1091
  },
  {
    "code": "ktu",
    "name": "Kituba",
    "sort_order": 1092
  },
  {
    "code": "gom",
    "name": "Konkani",
    "sort_order": 1093
  },
  {
    "code": "ko",
    "name": "Korean",
    "sort_order": 90
  },
  {
    "code": "kri",
    "name": "Krio",
    "sort_order": 1095
  },
  {
    "code": "ku",
    "name": "Kurdish (Kurmanji)",
    "sort_order": 1096
  },
  {
    "code": "ckb",
    "name": "Kurdish (Sorani)",
    "sort_order": 1097
  },
  {
    "code": "ky",
    "name": "Kyrgyz",
    "sort_order": 1098
  },
  {
    "code": "lo",
    "name": "Lao",
    "sort_order": 1099
  },
  {
    "code": "ltg",
    "name": "Latgalian",
    "sort_order": 1100
  },
  {
    "code": "la",
    "name": "Latin",
    "sort_order": 1101
  },
  {
    "code": "lv",
    "name": "Latvian",
    "sort_order": 1102
  },
  {
    "code": "lij",
    "name": "Ligurian",
    "sort_order": 1103
  },
  {
    "code": "li",
    "name": "Limburgan",
    "sort_order": 1104
  },
  {
    "code": "ln",
    "name": "Lingala",
    "sort_order": 1105
  },
  {
    "code": "lt",
    "name": "Lithuanian",
    "sort_order": 1106
  },
  {
    "code": "lmo",
    "name": "Lombard",
    "sort_order": 1107
  },
  {
    "code": "luo",
    "name": "Luo",
    "sort_order": 1108
  },
  {
    "code": "lb",
    "name": "Luxembourgish",
    "sort_order": 1109
  },
  {
    "code": "mk",
    "name": "Macedonian",
    "sort_order": 1110
  },
  {
    "code": "mai",
    "name": "Maithili",
    "sort_order": 1111
  },
  {
    "code": "mak",
    "name": "Makassar",
    "sort_order": 1112
  },
  {
    "code": "mg",
    "name": "Malagasy",
    "sort_order": 1113
  },
  {
    "code": "ms",
    "name": "Malay",
    "sort_order": 1114
  },
  {
    "code": "ms-Arab",
    "name": "Malay (Jawi)",
    "sort_order": 1115
  },
  {
    "code": "ml",
    "name": "Malayalam",
    "sort_order": 1116
  },
  {
    "code": "mt",
    "name": "Maltese",
    "sort_order": 1117
  },
  {
    "code": "mi",
    "name": "Maori",
    "sort_order": 1118
  },
  {
    "code": "mr",
    "name": "Marathi",
    "sort_order": 1119
  },
  {
    "code": "chm",
    "name": "Meadow Mari",
    "sort_order": 1120
  },
  {
    "code": "mni-Mtei",
    "name": "Meiteilon (Manipuri)",
    "sort_order": 1121
  },
  {
    "code": "min",
    "name": "Minang",
    "sort_order": 1122
  },
  {
    "code": "lus",
    "name": "Mizo",
    "sort_order": 1123
  },
  {
    "code": "mn",
    "name": "Mongolian",
    "sort_order": 1124
  },
  {
    "code": "my",
    "name": "Myanmar (Burmese)",
    "sort_order": 1125
  },
  {
    "code": "nr",
    "name": "Ndebele (South)",
    "sort_order": 1126
  },
  {
    "code": "new",
    "name": "Nepalbhasa (Newari)",
    "sort_order": 1127
  },
  {
    "code": "ne",
    "name": "Nepali",
    "sort_order": 1128
  },
  {
    "code": "nso",
    "name": "Northern Sotho (Sepedi)",
    "sort_order": 1129
  },
  {
    "code": "no",
    "name": "Norwegian",
    "sort_order": 1130
  },
  {
    "code": "nus",
    "name": "Nuer",
    "sort_order": 1131
  },
  {
    "code": "oc",
    "name": "Occitan",
    "sort_order": 1132
  },
  {
    "code": "or",
    "name": "Odia (Oriya)",
    "sort_order": 1133
  },
  {
    "code": "om",
    "name": "Oromo",
    "sort_order": 1134
  },
  {
    "code": "pag",
    "name": "Pangasinan",
    "sort_order": 1135
  },
  {
    "code": "pap",
    "name": "Papiamento",
    "sort_order": 1136
  },
  {
    "code": "ps",
    "name": "Pashto",
    "sort_order": 1137
  },
  {
    "code": "fa",
    "name": "Persian",
    "sort_order": 1138
  },
  {
    "code": "pl",
    "name": "Polish",
    "sort_order": 1139
  },
  {
    "code": "pt",
    "name": "Portuguese",
    "sort_order": 50
  },
  {
    "code": "pt-PT",
    "name": "Portuguese (Portugal)",
    "sort_order": 1141
  },
  {
    "code": "pt-BR",
    "name": "Portuguese (Brazil)",
    "sort_order": 130
  },
  {
    "code": "pa",
    "name": "Punjabi",
    "sort_order": 1143
  },
  {
    "code": "pa-Arab",
    "name": "Punjabi (Shahmukhi)",
    "sort_order": 1144
  },
  {
    "code": "qu",
    "name": "Quechua",
    "sort_order": 1145
  },
  {
    "code": "rom",
    "name": "Romani",
    "sort_order": 1146
  },
  {
    "code": "ro",
    "name": "Romanian",
    "sort_order": 1147
  },
  {
    "code": "rn",
    "name": "Rundi",
    "sort_order": 1148
  },
  {
    "code": "ru",
    "name": "Russian",
    "sort_order": 120
  },
  {
    "code": "sm",
    "name": "Samoan",
    "sort_order": 1150
  },
  {
    "code": "sg",
    "name": "Sango",
    "sort_order": 1151
  },
  {
    "code": "sa",
    "name": "Sanskrit",
    "sort_order": 1152
  },
  {
    "code": "gd",
    "name": "Scots Gaelic",
    "sort_order": 1153
  },
  {
    "code": "sr",
    "name": "Serbian",
    "sort_order": 1154
  },
  {
    "code": "st",
    "name": "Sesotho",
    "sort_order": 1155
  },
  {
    "code": "crs",
    "name": "Seychellois Creole",
    "sort_order": 1156
  },
  {
    "code": "shn",
    "name": "Shan",
    "sort_order": 1157
  },
  {
    "code": "sn",
    "name": "Shona",
    "sort_order": 1158
  },
  {
    "code": "scn",
    "name": "Sicilian",
    "sort_order": 1159
  },
  {
    "code": "szl",
    "name": "Silesian",
    "sort_order": 1160
  },
  {
    "code": "sd",
    "name": "Sindhi",
    "sort_order": 1161
  },
  {
    "code": "si",
    "name": "Sinhala (Sinhalese)",
    "sort_order": 1162
  },
  {
    "code": "sk",
    "name": "Slovak",
    "sort_order": 1163
  },
  {
    "code": "sl",
    "name": "Slovenian",
    "sort_order": 1164
  },
  {
    "code": "so",
    "name": "Somali",
    "sort_order": 1165
  },
  {
    "code": "es",
    "name": "Spanish",
    "sort_order": 10
  },
  {
    "code": "su",
    "name": "Sundanese",
    "sort_order": 1167
  },
  {
    "code": "sw",
    "name": "Swahili",
    "sort_order": 1168
  },
  {
    "code": "ss",
    "name": "Swati",
    "sort_order": 1169
  },
  {
    "code": "sv",
    "name": "Swedish",
    "sort_order": 1170
  },
  {
    "code": "tg",
    "name": "Tajik",
    "sort_order": 1171
  },
  {
    "code": "ta",
    "name": "Tamil",
    "sort_order": 1172
  },
  {
    "code": "tt",
    "name": "Tatar",
    "sort_order": 1173
  },
  {
    "code": "te",
    "name": "Telugu",
    "sort_order": 1174
  },
  {
    "code": "tet",
    "name": "Tetum",
    "sort_order": 1175
  },
  {
    "code": "th",
    "name": "Thai",
    "sort_order": 1176
  },
  {
    "code": "ti",
    "name": "Tigrinya",
    "sort_order": 1177
  },
  {
    "code": "ts",
    "name": "Tsonga",
    "sort_order": 1178
  },
  {
    "code": "tn",
    "name": "Tswana",
    "sort_order": 1179
  },
  {
    "code": "tr",
    "name": "Turkish",
    "sort_order": 1180
  },
  {
    "code": "tk",
    "name": "Turkmen",
    "sort_order": 1181
  },
  {
    "code": "ak",
    "name": "Twi (Akan)",
    "sort_order": 1182
  },
  {
    "code": "uk",
    "name": "Ukrainian",
    "sort_order": 1183
  },
  {
    "code": "ur",
    "name": "Urdu",
    "sort_order": 1184
  },
  {
    "code": "ug",
    "name": "Uyghur",
    "sort_order": 1185
  },
  {
    "code": "uz",
    "name": "Uzbek",
    "sort_order": 1186
  },
  {
    "code": "vi",
    "name": "Vietnamese",
    "sort_order": 1187
  },
  {
    "code": "cy",
    "name": "Welsh",
    "sort_order": 1188
  },
  {
    "code": "xh",
    "name": "Xhosa",
    "sort_order": 1189
  },
  {
    "code": "yi",
    "name": "Yiddish",
    "sort_order": 1190
  },
  {
    "code": "yo",
    "name": "Yoruba",
    "sort_order": 1191
  },
  {
    "code": "yua",
    "name": "Yucatec Maya",
    "sort_order": 1192
  },
  {
    "code": "zu",
    "name": "Zulu",
    "sort_order": 1193
  }
];

/** Case-insensitive aliases → canonical `name` from REFERENCE_LANGUAGES. */
const LANGUAGE_ALIASES = {
  "mandarin": "Chinese (Simplified)",
  "mandarin chinese": "Chinese (Simplified)",
  "standard mandarin": "Chinese (Simplified)",
  "chinese": "Chinese (Simplified)",
  "chinese (china)": "Chinese (Simplified)",
  "chinese simplified": "Chinese (Simplified)",
  "chinese (traditional)": "Chinese (Traditional)",
  "chinese traditional": "Chinese (Traditional)",
  "cantonese chinese": "Cantonese",
  "farsi": "Persian",
  "dari": "Persian",
  "burmese": "Myanmar (Burmese)",
  "myanmar": "Myanmar (Burmese)",
  "tagalog": "Filipino (Tagalog)",
  "filipino": "Filipino (Tagalog)",
  "sinhala": "Sinhala (Sinhalese)",
  "sinhalese": "Sinhala (Sinhalese)",
  "portuguese (brazil)": "Portuguese (Brazil)",
  "brazilian portuguese": "Portuguese (Brazil)",
  "portuguese (portugal)": "Portuguese (Portugal)",
  "french (canada)": "French (Canadian)",
  "french (canadian)": "French (Canadian)",
  "kurdish": "Kurdish (Kurmanji)",
  "punjabi (shahmukhi)": "Punjabi (Shahmukhi)",
  "chichewa": "Chichewa (Nyanja)",
  "nyanja": "Chichewa (Nyanja)",
  "odia": "Odia (Oriya)",
  "oriya": "Odia (Oriya)",
  "scots gaelic": "Scots Gaelic",
  "gaelic": "Scots Gaelic",
  "twi": "Twi (Akan)",
  "akan": "Twi (Akan)",
  "luganda": "Ganda (Luganda)",
  "ganda": "Ganda (Luganda)",
  "iw": "Hebrew"
};

module.exports = {
  REFERENCE_LANGUAGES,
  LANGUAGE_ALIASES,
};

