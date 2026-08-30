import { Router } from "express";
import { loadDocs, getDocSections, extractHeadings } from "./docsRenderer";
import { isAuthenticated } from "../../handlers/utils/auth/authUtil";
import type { Module } from "../../handlers/moduleInit";

const coreModule: Module = {
  info: {
    name: "Docs Module",
    description: "Markdown documentation renderer.",
    version: "1.0.0",
    moduleVersion: "1.0.0",
    author: "AirLinkLab",
    license: "MIT",
  },

  router: () => {
    const router = Router();

    // GET /docs — main docs page (index)
    router.get("/docs", isAuthenticated(true), async (req, res) => {
      const sections = await getDocSections();
      res.render("docs/index", {
        sections,
        currentSlug: null,
        user: req.session.user,
        req,
      });
    });

    // GET /docs/:slug — render a doc page
    router.get("/docs/:slug(*)", isAuthenticated(true), async (req, res) => {
      const pages = await loadDocs();
      const slug = req.params.slug;
      const page = pages.find((p) => p.slug === slug);
      if (!page) return res.status(404).render("errors/404");

      const sections = await getDocSections();
      const headings = extractHeadings(page.html);

      res.render("docs/page", {
        page,
        sections,
        headings,
        currentSlug: slug,
        user: req.session.user,
        req,
      });
    });

    return router;
  },
};

export default coreModule;
