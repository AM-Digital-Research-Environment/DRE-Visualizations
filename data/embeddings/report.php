<?php http_response_code(404); exit; ?>
{
  "scope": {
    "siteId": 1,
    "revision": "c25ace69c821d1a09fa7e4cd798b3c32",
    "profile": "7c4045eddba07aadec418a8ed1711a04e953715bb852e33bb105a2cc7b05aafe"
  },
  "schemaVersion": 1,
  "generatedAt": "2026-10-13T09:41:49Z",
  "source": "https://data.africamultiple.uni-bayreuth.de",
  "model": "google/embeddinggemma-2",
  "dimensions": 768,
  "taskPrefix": "task: sentence similarity | query: ",
  "modelRevision": "914f7f89142e33e77833254d9c9b90c3cef7303b",
  "inferenceDtype": "float32",
  "cardPolicy": {
    "maxWords": 900,
    "lowSignalThresholdChars": 100,
    "lowSignalMeasures": "own title, abstract or description, subjects and places",
    "fullTextEmbedded": false,
    "allItemsShareTheSameLengthBudget": true
  },
  "corpora": {
    "podcasts": {
      "fetched": 43,
      "public": 43,
      "nonPublicSkipped": 0,
      "cards": 43,
      "lowSignal": 7,
      "truncated": 0
    },
    "youtube": {
      "fetched": 140,
      "public": 140,
      "nonPublicSkipped": 0,
      "cards": 140,
      "lowSignal": 18,
      "truncated": 0
    },
    "publications": {
      "fetched": 555,
      "public": 555,
      "nonPublicSkipped": 0,
      "cards": 555,
      "lowSignal": 138,
      "truncated": 7
    },
    "projects": {
      "fetched": 93,
      "public": 93,
      "nonPublicSkipped": 0,
      "cards": 93,
      "lowSignal": 18,
      "truncated": 0
    },
    "sections": {
      "fetched": 13,
      "public": 13,
      "nonPublicSkipped": 0,
      "cards": 13,
      "lowSignal": 1,
      "truncated": 4
    },
    "research-items": {
      "fetched": 3793,
      "public": 3793,
      "nonPublicSkipped": 0,
      "cards": 3793,
      "lowSignal": 1243,
      "truncated": 0
    }
  },
  "totals": {
    "cards": 4637,
    "lowSignal": 1425,
    "recommendable": 3212,
    "truncated": 11,
    "maximumInputWords": 900
  },
  "cache": {
    "embedded": 0,
    "reused": 4637,
    "sharedWithIdenticalCard": 0,
    "staleRemoved": 0
  },
  "artifactBytes": {
    "map": 857486,
    "similar": 1828148
  },
  "recommendations": {
    "sources": 3212,
    "sourcesWithCrossTypeNeighbour": 587,
    "sourcesWithCrossLanguageNeighbour": 585,
    "meanSimilarity": 0.928564,
    "crossLanguageExamples": [
      {
        "source": 7717,
        "sourceLanguages": [
          "English",
          "Swahili"
        ],
        "target": 7720,
        "targetLanguages": [
          "French"
        ],
        "score": 0.930119
      },
      {
        "source": 7718,
        "sourceLanguages": [
          "English"
        ],
        "target": 7720,
        "targetLanguages": [
          "French"
        ],
        "score": 0.925002
      },
      {
        "source": 7720,
        "sourceLanguages": [
          "French"
        ],
        "target": 7717,
        "targetLanguages": [
          "English",
          "Swahili"
        ],
        "score": 0.930119
      },
      {
        "source": 7726,
        "sourceLanguages": [
          "Igbo",
          "Ga"
        ],
        "target": 7738,
        "targetLanguages": [
          "Yoruba"
        ],
        "score": 0.967405
      },
      {
        "source": 7738,
        "sourceLanguages": [
          "Yoruba"
        ],
        "target": 7726,
        "targetLanguages": [
          "Igbo",
          "Ga"
        ],
        "score": 0.967405
      },
      {
        "source": 7954,
        "sourceLanguages": [
          "Swahili"
        ],
        "target": 7738,
        "targetLanguages": [
          "Yoruba"
        ],
        "score": 0.936792
      },
      {
        "source": 7955,
        "sourceLanguages": [
          "Swahili"
        ],
        "target": 7738,
        "targetLanguages": [
          "Yoruba"
        ],
        "score": 0.928551
      },
      {
        "source": 7956,
        "sourceLanguages": [
          "Swahili"
        ],
        "target": 7738,
        "targetLanguages": [
          "Yoruba"
        ],
        "score": 0.942122
      },
      {
        "source": 7957,
        "sourceLanguages": [
          "Swahili"
        ],
        "target": 7738,
        "targetLanguages": [
          "Yoruba"
        ],
        "score": 0.940708
      },
      {
        "source": 9041,
        "sourceLanguages": [
          "English"
        ],
        "target": 7720,
        "targetLanguages": [
          "French"
        ],
        "score": 0.895287
      },
      {
        "source": 9042,
        "sourceLanguages": [
          "English"
        ],
        "target": 10021,
        "targetLanguages": [
          "French"
        ],
        "score": 0.886193
      },
      {
        "source": 9043,
        "sourceLanguages": [
          "English"
        ],
        "target": 10021,
        "targetLanguages": [
          "French"
        ],
        "score": 0.886193
      }
    ]
  },
  "release": {
    "schemaVersion": 1,
    "model": "google/embeddinggemma-2",
    "dimensions": 768,
    "dtype": "float32-le",
    "normalization": "l2",
    "count": 4637,
    "modelRevision": "914f7f89142e33e77833254d9c9b90c3cef7303b",
    "inferenceDtype": "float32",
    "taskPrefix": "task: sentence similarity | query: ",
    "rowOrder": "ids.json",
    "vectors": "vectors.f32",
    "vectorsSha256": "2e9b4fd788745380e79ad7bfbb71fd84e98a2a757aadf16f0b43407bcf2e0ced",
    "generatedAt": "2026-10-13T09:41:49Z",
    "source": "https://data.africamultiple.uni-bayreuth.de",
    "scope": {
      "siteId": 1,
      "revision": "c25ace69c821d1a09fa7e4cd798b3c32",
      "profile": "7c4045eddba07aadec418a8ed1711a04e953715bb852e33bb105a2cc7b05aafe"
    },
    "sourceCommit": "e30692f8c3896987833c37f718dc272328a13203"
  }
}
