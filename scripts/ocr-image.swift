import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count >= 2 else {
  fputs("Usage: ocr-image.swift <image>\n", stderr)
  exit(1)
}

let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])
guard let image = NSImage(contentsOf: imageURL),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  fputs("Unable to load image\n", stderr)
  exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.minimumTextHeight = 0.002

try VNImageRequestHandler(cgImage: cgImage).perform([request])
let observations = (request.results ?? []).sorted {
  let leftTop = 1 - $0.boundingBox.maxY
  let rightTop = 1 - $1.boundingBox.maxY
  return abs(leftTop - rightTop) > 0.002
    ? leftTop < rightTop
    : $0.boundingBox.minX < $1.boundingBox.minX
}

for observation in observations {
  guard let candidate = observation.topCandidates(1).first else { continue }
  let box = observation.boundingBox
  print(String(format: "%.5f\t%.5f\t%.5f\t%.5f\t%.3f\t%@",
               box.minX, 1 - box.maxY, box.width, box.height,
               candidate.confidence, candidate.string))
}
