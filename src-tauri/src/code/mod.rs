//! Code-listing support: indexing project source files, finding named regions,
//! and importing snippets while tracking whether they drift from their source.
//!
//! This module knows nothing about LaTeX. Turning a snippet into a `minted` or
//! `listings` environment is the frontend's job (`src/services/listings/`),
//! which keeps the generated markup — the thing the user actually owns — in one
//! place that is easy to read and change.

pub mod import;
pub mod indexer;
pub mod regions;
