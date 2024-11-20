#!/usr/bin/env python3

# Script to build a universal.apk from .apkm files

import os
import subprocess
import click
import zipfile
import json
import xml.etree.ElementTree
import shutil
from hashlib import sha256
from loguru import logger
from pathlib import Path

# KEYSTORE_PATH = "obsidian-custom.jks"


def apktool_decode(apk_path: Path):
    # Decode the APK
    ret = subprocess.run(
        [
            "apktool",
            "d",
            apk_path.resolve(),
        ],
        capture_output=True,
        cwd=apk_path.parent,
    )
    if ret.returncode != 0:
        logger.error(f"Error decoding {apk_path}")
        logger.error(ret.stderr)
        raise Exception(f"Error decoding {apk_path}")

    return apk_path.parent / apk_path.stem


def apktool_build(decoded_path: Path, output_apk: Path):
    # Build the APK
    ret = subprocess.run(
        [
            "apktool",
            "b",
            decoded_path.resolve(),
            "-o",
            output_apk.resolve(),
        ],
        capture_output=True,
    )
    if ret.returncode != 0:
        logger.error(f"Error building {decoded_path}")
        logger.error(ret.stderr.decode())
        raise Exception(f"Error building {decoded_path}")


def merge_android_manifest(src: Path, dest: Path):
    # merge the AndroidManifest.xml
    pass


####################
# Fix public resource identifiers that are shared across split APKs.
# Maps all APKTOOL_DUMMY_ resource IDs in the base APK to the proper resource names from the
# split APKs, then updates references in other resource files in the base APK to use proper
# resource names.
####################
def fix_public_resource_ids(base_apk_dir: Path, split_apk_paths: list[Path]):
    # Bail if the base APK does not have a public.xml
    if not (base_apk_dir / "res" / "values" / "public.xml").exists():
        return

    # Mappings of resource IDs and names
    idToDummyName = {}
    dummyNameToRealName = {}

    # Step 1) Find all resource IDs that apktool has assigned a name of APKTOOL_DUMMY_XXX to.
    #        Load these into the lookup tables ready to resolve the real resource names from
    #        the split APKs in step 2 below.
    baseXmlTree = xml.etree.ElementTree.parse(
        base_apk_dir / "res" / "values" / "public.xml"
    )
    for el in baseXmlTree.getroot():
        if "name" in el.attrib and "id" in el.attrib:
            if (
                el.attrib["name"].startswith("APKTOOL_DUMMY_")
                and el.attrib["name"] not in idToDummyName
            ):
                idToDummyName[el.attrib["id"]] = el.attrib["name"]
                dummyNameToRealName[el.attrib["name"]] = None

    if not idToDummyName:
        return

    logger.info(f"Resolving {len(idToDummyName)} resource identifiers.")

    # Step 2) Parse the public.xml file from each split APK in search of resource IDs matching
    #        those loaded during step 1. Each match gives the true resource name allowing us to
    #        replace all APKTOOL_DUMMY_XXX resource names with the true resource names back in
    #        the base APK.
    for split_apk_path in split_apk_paths:
        if (split_apk_path / "res" / "values" / "public.xml").exists():
            tree = xml.etree.ElementTree.parse(
                split_apk_path / "res" / "values" / "public.xml"
            )
            for el in tree.getroot():
                if "name" in el.attrib and "id" in el.attrib:
                    if el.attrib["id"] in idToDummyName:
                        dummyNameToRealName[idToDummyName[el.attrib["id"]]] = el.attrib[
                            "name"
                        ]

    # Step 3) Update the base APK to replace all APKTOOL_DUMMY_XXX resource names with the true
    #        resource name.
    updated = 0
    for el in baseXmlTree.getroot():
        if "name" in el.attrib and "id" in el.attrib:
            if (
                el.attrib["name"] in dummyNameToRealName
                and dummyNameToRealName[el.attrib["name"]] is not None
            ):
                el.attrib["name"] = dummyNameToRealName[el.attrib["name"]]
                updated += 1
    baseXmlTree.write(
        base_apk_dir / "res" / "values" / "public.xml",
        encoding="utf-8",
        xml_declaration=True,
    )
    logger.info(
        f"Updated {str(updated)} dummy resource names with true names in the base APK."
    )

    # Step 4) Find all references to APKTOOL_DUMMY_XXX resources within other XML resource files
    #        in the base APK and update them to refer to the true resource name.
    updated = 0
    for root, dirs, files in os.walk(base_apk_dir / "res"):
        for f in files:
            if f.lower().endswith(".xml"):
                try:
                    # Load the XML
                    logger.debug("[~] Parsing " + os.path.join(root, f))
                    tree = xml.etree.ElementTree.parse(os.path.join(root, f))

                    # Register the namespaces and get the prefix for the "android" namespace
                    namespaces = dict(
                        [
                            node
                            for _, node in xml.etree.ElementTree.iterparse(
                                base_apk_dir / "AndroidManifest.xml",
                                events=["start-ns"],
                            )
                        ]
                    )
                    for ns in namespaces:
                        xml.etree.ElementTree.register_namespace(ns, namespaces[ns])
                    ns = "{" + namespaces["android"] + "}"

                    # Update references to APKTOOL_DUMMY_XXX resources
                    changed = False
                    for el in tree.iter():
                        # Check for references to APKTOOL_DUMMY_XXX resources in attributes of this element
                        for attr in el.attrib:
                            val = el.attrib[attr]
                            if (
                                val.startswith("@")
                                and "/" in val
                                and val.split("/")[1].startswith("APKTOOL_DUMMY_")
                                and dummyNameToRealName[val.split("/")[1]] is not None
                            ):
                                el.attrib[attr] = (
                                    val.split("/")[0]
                                    + "/"
                                    + dummyNameToRealName[val.split("/")[1]]
                                )
                                updated += 1
                                changed = True
                            elif (
                                val.startswith("APKTOOL_DUMMY_")
                                and dummyNameToRealName[val] is not None
                            ):
                                el.attrib[attr] = dummyNameToRealName[val]
                                updated += 1
                                changed = True

                        # Check for references to APKTOOL_DUMMY_XXX resources in the element text
                        val = el.text
                        if (
                            val is not None
                            and val.startswith("@")
                            and "/" in val
                            and val.split("/")[1].startswith("APKTOOL_DUMMY_")
                            and dummyNameToRealName[val.split("/")[1]] is not None
                        ):
                            el.text = (
                                val.split("/")[0]
                                + "/"
                                + dummyNameToRealName[val.split("/")[1]]
                            )
                            updated += 1
                            changed = True

                    # Save the file if it was updated
                    if changed == True:
                        tree.write(
                            os.path.join(root, f),
                            encoding="utf-8",
                            xml_declaration=True,
                        )
                except xml.etree.ElementTree.ParseError:
                    logger.info(
                        "[-] XML parse error in "
                        + os.path.join(root, f)
                        + ", skipping."
                    )
    logger.info(
        f"Updated {updated} references to dummy resource names in the base APK."
    )


def copy2_conflict(src: str, dest: str):
    if Path(dest).exists():
        # compare hashes
        src_hash = sha256(Path(src).read_bytes()).hexdigest()
        dest_hash = sha256(Path(dest).read_bytes()).hexdigest()
        if src_hash != dest_hash:
            logger.warning(f"File {dest} already exists in the destination directory")

    shutil.copy2(src, dest)


def merge_decoded_apks(base_apk_dir: Path, split_config_apk_dir: Path):
    # merge the decoded files
    for file in split_config_apk_dir.iterdir():
        if file.is_dir() and file.name != "original":
            # merge the files
            logger.info(f"Moving {file} to {base_apk_dir / file.name}")
            shutil.copytree(
                file,
                base_apk_dir / file.name,
                dirs_exist_ok=True,
                copy_function=copy2_conflict,
            )
        elif file.is_file() and file.name == "AndroidManifest.xml":
            # merge the AndroidManifest.xml
            merge_android_manifest(file, base_apk_dir / "AndroidManifest.yml")


####################
# Update AndroidManifest.xml to disable APK splitting.
# -> Removes the "isSplitRequired" attribute of the "application" element.
# -> Sets the "extractNativeLibs" attribute of the "application" element.
# -> Removes meta-data elements with the name "com.android.vending.splits" or "com.android.vending.splits.required"
####################
def disable_split_apk(base_apk_dir: Path):
    # Load AndroidManifest.xml
    tree = xml.etree.ElementTree.parse(base_apk_dir / "AndroidManifest.xml")

    # Register the namespaces and get the prefix for the "android" namespace
    namespaces = dict(
        [
            node
            for _, node in xml.etree.ElementTree.iterparse(
                base_apk_dir / "AndroidManifest.xml", events=["start-ns"]
            )
        ]
    )
    for ns in namespaces:
        xml.etree.ElementTree.register_namespace(ns, namespaces[ns])
    ns = "{" + namespaces["android"] + "}"

    # Disable APK splitting
    appEl = None
    elsToRemove = []
    for el in tree.iter():
        if el.tag == "manifest":
            if ns + "requiredSplitTypes" in el.attrib:
                del el.attrib[ns + "requiredSplitTypes"]
            if ns + "splitTypes" in el.attrib:
                del el.attrib[ns + "splitTypes"]
        elif el.tag == "application":
            appEl = el
            if ns + "isSplitRequired" in el.attrib:
                del el.attrib[ns + "isSplitRequired"]
            if ns + "extractNativeLibs" in el.attrib:
                el.attrib[ns + "extractNativeLibs"] = "true"
        elif appEl is not None and el.tag == "meta-data":
            if ns + "name" in el.attrib:
                if el.attrib[ns + "name"] == "com.android.vending.splits.required":
                    elsToRemove.append(el)
                elif el.attrib[ns + "name"] == "com.android.vending.splits":
                    elsToRemove.append(el)
    for el in elsToRemove:
        appEl.remove(el)

    # Save the updated AndroidManifest.xml
    tree.write(
        base_apk_dir / "AndroidManifest.xml",
        encoding="utf-8",
        xml_declaration=True,
    )


@click.command()
@click.argument("input")
def main(input):
    input = Path(input)

    zip = zipfile.ZipFile(input, "r")

    # file list
    files = zip.namelist()

    apk_files = [f for f in files if f.endswith(".apk")]

    logger.info(f"Found {len(apk_files)} APK files")

    split_config_packages = [f for f in apk_files if f.startswith("split_config.")]
    logger.info(f"Found {len(split_config_packages)} split_config packages")

    # extract base.apk first
    base_apk = zip.extract("base.apk", path=input.parent)
    base_apk_decoded = apktool_decode(Path(base_apk))

    split_paths = []

    # extract split_config packages
    for split_config_package in split_config_packages:
        split_config_apk = zip.extract(split_config_package, path=input.parent)
        split_config_apk_decoded = apktool_decode(Path(split_config_apk))

        # merge the decoded files
        merge_decoded_apks(base_apk_decoded, split_config_apk_decoded)

        split_paths.append(split_config_apk_decoded)

    fix_public_resource_ids(base_apk_decoded, split_paths)

    # fix the final manifest
    disable_split_apk(base_apk_decoded)

    # rebuild
    apktool_build(base_apk_decoded, input.with_suffix(".apk"))

    # zipalign
    # subprocess.run(
    #     [
    #         "zipalign",
    #         "-v",
    #         "-p",
    #         "4",
    #         input.parent / "universal.apk",
    #         input.parent / "universal-aligned.apk",
    #     ]
    # )

    # sign
    # subprocess.run(
    #     [
    #         "apksigner",
    #         "sign",
    #         "--ks",
    #         KEYSTORE_PATH,
    #         "--ks-key-alias",
    #         "erfur",
    #         "--ks-pass",
    #         "pass:pass",
    #         input.parent / "universal-aligned.apk",
    #     ]
    # )


if __name__ == "__main__":
    main()
