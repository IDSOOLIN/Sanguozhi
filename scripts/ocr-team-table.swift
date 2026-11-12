import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count >= 2 else { exit(1) }
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let image = NSImage(contentsOf: url),
      let full = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }

let startY = 0.0870
let rowHeight = 0.01580
let rowCount = 50
let cropX = 0.165
let cropWidth = 0.805
let columnBounds: [(String, Double, Double)] = [
  ("team", 0.165, 0.300),
  ("score", 0.300, 0.380),
  ("generals", 0.380, 0.475),
  ("tactics", 0.475, 0.610),
  ("books", 0.610, 0.710),
  ("points", 0.710, 0.790),
  ("gear", 0.790, 0.875),
  ("notes", 0.875, 0.970),
]

for row in 0..<rowCount {
  let top = startY + Double(row) * rowHeight
  let rect = CGRect(
    x: Double(full.width) * cropX,
    y: Double(full.height) * top,
    width: Double(full.width) * cropWidth,
    height: Double(full.height) * rowHeight
  ).integral
  guard let cropped = full.cropping(to: rect) else { continue }
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  request.recognitionLanguages = ["zh-Hans", "en-US"]
  request.minimumTextHeight = 0.05
  try VNImageRequestHandler(cgImage: cropped).perform([request])
  let values = columnBounds.map { column -> String in
    let texts = (request.results ?? []).compactMap { observation -> (Double, String)? in
      let centerX = cropX + Double(observation.boundingBox.midX) * cropWidth
      guard centerX >= column.1, centerX < column.2,
            let text = observation.topCandidates(1).first?.string else { return nil }
      return (1 - Double(observation.boundingBox.maxY), text.replacingOccurrences(of: "\n", with: " "))
    }.sorted { $0.0 < $1.0 }.map(\.1)
    return texts.joined(separator: " / ")
  }
  print(([String(row + 1)] + values).joined(separator: "\t"))
}
