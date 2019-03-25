import { navigate } from "gatsby"
import _ from "lodash"
import React, {
  useContext,
  useLayoutEffect,
  useState,
  useRef,
  useEffect,
  createContext,
} from "react"
import CandidateStatsRow from "../components/CandidateStatsRow"
import CloseButton from "../components/CloseButton"
import MainLayout from "../components/MainLayout"
import NationwideSubSummaryHeader from "../components/NationwideSubSummaryBox"
import NationwideSummaryHeader from "../components/NationwideSummaryHeader"
import PartyStatsList from "../components/PartyStatsList"
import TotalVoterSummary from "../components/TotalVoterSummary"
import { ZoneFilterContext } from "../components/ZoneFilterPanel"
import ZoneMasterView from "../components/ZoneMasterView"
import Arrow from "../components/Arrow"
import {
  checkFilter,
  filterPath,
  filters,
  getProvinceById,
  getZoneByProvinceIdAndZoneNo,
  zones,
  zonePath,
  getPartyById,
} from "../models/information"
import { useSummaryData, usePerZoneData } from "../models/LiveDataSubscription"
import {
  partyStatsFromSummaryJSON,
  partyStatsRowTotalSeats,
  isZoneFinished,
} from "../models/PartyStats"
import { DISPLAY_FONT, labelColor } from "../styles"
import Loading from "../components/Loading"
import Placeholder from "../components/Placeholder"
import UndesirableState from "../components/UndesirableState"
import LoadingError from "../components/LoadingError"
import { TimeMachine } from "../models/TimeTraveling"

const MobileTabContext = createContext(
  /** @type {import('../components/ZoneMasterView').MobileTab} */ ("summary")
)

export default ({ pageContext, location }) => (
  <MainLayout activeNavBarSection="by-area">
    <ZonePageContainer pageContext={pageContext} location={location} />
  </MainLayout>
)

function ZonePageContainer({ pageContext, location }) {
  /** @type {ZoneFilterName | null} */
  const filterNameFromRoute = pageContext.zoneView
    ? null
    : pageContext.filterName || "all"
  const filterNameRef = useRef(filterNameFromRoute || "all")
  const filterName =
    filterNameFromRoute != null ? filterNameFromRoute : filterNameRef.current
  useEffect(() => {
    filterNameRef.current = filterName
  })

  /** @type {import('../components/ZoneMasterView').MobileTab | null} */
  const mobileTabFromRoute = pageContext.zoneView
    ? null
    : getTabFromUrl(location)
  const currentMobileTabRef = useRef(mobileTabFromRoute || "summary")
  const currentMobileTab =
    mobileTabFromRoute != null
      ? mobileTabFromRoute
      : currentMobileTabRef.current
  const switchMobileTab = targetTab => {
    if (targetTab === "summary") {
      navigate(`${location.pathname}`)
    } else {
      navigate(`${location.pathname}?tab=${targetTab}`)
    }
  }
  useEffect(() => {
    currentMobileTabRef.current = currentMobileTab
  })

  return (
    <ZoneFilterContext.Provider value={filterName}>
      <MobileTabContext.Provider value={currentMobileTab}>
        <ZoneMasterView
          currentZone={pageContext.zoneView}
          contentHeader={
            <SummaryHeaderContainer key={filterName} filterName={filterName} />
          }
          contentBody={
            <PartyStatsContainer key={filterName} filterName={filterName} />
          }
          popup={
            pageContext.zoneView ? <ZoneView {...pageContext.zoneView} /> : null
          }
          currentMobileTab={currentMobileTab}
          switchMobileTab={switchMobileTab}
        />
      </MobileTabContext.Provider>
    </ZoneFilterContext.Provider>
  )
}

function getTabFromUrl(location) {
  const matches = location.search.match(/(\?|&)tab=(.+)(&|$)/)
  return matches ? matches[2] : "summary"
}

/**
 * @param {object} props
 * @param {ZoneFilterName} props.filterName
 */
function SummaryHeaderContainer({ filterName }) {
  const summaryState = useSummaryData()
  const currentFilter = filters[filterName]
  const totalZoneCount = zones.filter(zone => checkFilter(currentFilter, zone))
    .length
  const title = currentFilter.name.th

  if (!summaryState.completed) {
    return (
      <NationwideSummaryHeader
        title={title}
        loading
        totalZoneCount={totalZoneCount}
      />
    )
  }

  const summary = summaryState.data
  const allZoneStats = _.chain(summary.zoneStatsMap)
    .flatMap((zoneNoStatsMap, provinceId) =>
      _.map(zoneNoStatsMap, (stats, zoneNo) => ({
        provinceId: +provinceId,
        zoneNo: +zoneNo,
        stats,
      }))
    )
    .filter(row =>
      checkFilter(
        currentFilter,
        getZoneByProvinceIdAndZoneNo(row.provinceId, row.zoneNo)
      )
    )
    .map(row => row.stats)
    .value()

  const mockData = {
    totalZoneCount,
    completedZoneCount: _.sumBy(allZoneStats, s => (isZoneFinished(s) ? 1 : 0)),
    totalVoteCount: _.sumBy(allZoneStats, s => s.votesTotal),
    eligibleVoterCount: _.sumBy(allZoneStats, s => s.eligible),
  }
  return <NationwideSummaryHeader title={title} {...mockData} />
}

function PartyStatsContainer({ filterName }) {
  const summaryState = useSummaryData()
  if (!summaryState.completed) {
    if (summaryState.failed) {
      return <LoadingError />
    }
    return <Loading size="large" />
  }

  const summary = summaryState.data
  const currentFilter = filters[filterName]
  const filtered = filterName !== "all"
  const filteredPartyStats = _.chain(
    partyStatsFromSummaryJSON(summary, {
      filter: currentFilter,
    })
  )
    .map(row => (filtered ? { ...row, partyListSeats: 0 } : row))
    .filter(row => partyStatsRowTotalSeats(row) > 0)
    .sortBy(row => row.seatsCeiling)
    .sortBy(row => partyStatsRowTotalSeats(row))
    .reverse()
    .value()

  if (filteredPartyStats.length < 1) {
    return (
      <UndesirableState
        heading={
          <span>
            ยังไม่มีพรรคไหน
            <br />
            ได้ที่นั่ง ส.ส.
          </span>
        }
      >
        เริ่มแสดงผลเมื่อนับคะแนนแล้ว 10%
      </UndesirableState>
    )
  }

  return <PartyStatsList partyStats={filteredPartyStats} filtered={filtered} />
}

function ZoneView({ provinceId, zoneNo }) {
  const zone = getZoneByProvinceIdAndZoneNo(provinceId, zoneNo)
  const province = getProvinceById(provinceId)
  const activeFilter = useContext(ZoneFilterContext)
  const summaryState = useSummaryData()
  const mobileTab = useContext(MobileTabContext)

  /**
   * @template T
   * @param {(data: { summary: ElectionDataSource.SummaryJSON; zoneStats: ElectionDataSource.ZoneStats }) => T} f
   * @param {() => T} otherwise
   */
  const ifSummaryLoaded = (f, otherwise) =>
    summaryState.completed
      ? f({
          summary: summaryState.data,
          zoneStats: summaryState.data.zoneStatsMap[provinceId][zoneNo],
        })
      : otherwise()

  return (
    <div
      css={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        padding: 10,
      }}
    >
      <div css={{ flex: "auto", position: "relative" }}>
        <div
          css={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            overflowX: "hidden",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <CloseButton
            onClick={() =>
              navigate(
                filterPath(activeFilter) +
                  (mobileTab === "summary" ? "" : `?tab=${mobileTab}`)
              )
            }
          />
          <div
            css={{
              textAlign: "center",
              flex: "none",
            }}
          >
            <h1 css={{ fontFamily: DISPLAY_FONT, margin: "0.63em 0 0.1em 0" }}>
              {province.name}
            </h1>
            <h2
              css={{
                fontFamily: DISPLAY_FONT,
                color: labelColor,
                margin: "0.3em 0 0.5em 0",
                position: "relative",
              }}
            >
              <Arrow
                onLeftArrowClick={() => {
                  navigate(zonePath({ provinceId, no: zoneNo - 1 || 1 }))
                }}
                onRightArrowClick={() =>
                  navigate(
                    zonePath({
                      provinceId,
                      no: zoneNo < province.zone ? zoneNo + 1 : province.zone,
                    })
                  )
                }
                hideLeftArrow={zoneNo === 1}
                hideRightArrow={zoneNo === province.zone}
              >
                เขตเลือกตั้งที่ {zone.no}
              </Arrow>
            </h2>
            <div
              css={{
                marginBottom: 10,
              }}
            >
              {zone.details}
            </div>
            <div>
              <span>นับแล้ว</span>
              <span
                css={{
                  marginLeft: 10,
                  fontSize: "1.7em",
                  fontFamily: DISPLAY_FONT,
                }}
              >
                {ifSummaryLoaded(data => data.zoneStats.progress, () => 0)}%
              </span>
            </div>

            <div
              css={{
                borderTop: "1px solid",
                // borderBottom: "1px solid",
                marginBottom: 10,
              }}
            >
              <TotalVoterSummary
                totalVoteCount={ifSummaryLoaded(
                  data => data.zoneStats.votesTotal,
                  () => 0
                )}
                totalVotePercentage={ifSummaryLoaded(
                  data => {
                    const zoneStats = data.zoneStats
                    return Math.round(
                      (zoneStats.votesTotal / zoneStats.eligible) * 100
                    )
                  },
                  () => 0
                )}
              />
            </div>

            <div css={{ borderBottom: "1px solid", display: "none" }}>
              <NationwideSubSummaryHeader
                label="บัตรดี"
                stat={ifSummaryLoaded(
                  data => data.zoneStats.goodVotes,
                  () => (
                    <Loading size="small" />
                  )
                )}
                idx={0}
              />
              <NationwideSubSummaryHeader
                label="บัตรเสีย"
                stat={ifSummaryLoaded(
                  data => data.zoneStats.badVotes,
                  () => (
                    <Loading size="small" />
                  )
                )}
                idx={1}
              />
            </div>
          </div>
          <ZoneCandidateList
            key={`${provinceId}:${zoneNo}`}
            provinceId={provinceId}
            zoneNo={zoneNo}
            zoneStats={ifSummaryLoaded(data => data.zoneStats, () => null)}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * @param {object} props
 * @param {number} props.provinceId
 * @param {number} props.zoneNo
 * @param {ElectionDataSource.ZoneStats} props.zoneStats
 */
function ZoneCandidateList({ provinceId, zoneNo, zoneStats }) {
  const dataState = usePerZoneData(provinceId, zoneNo)
  if (!dataState.completed || !zoneStats) {
    if (dataState.failed) {
      return <LoadingError />
    }
    return <Loading size="large" />
  }
  const data = dataState.data
  if (!data) {
    return (
      <Placeholder height={150}>
        No information for province {provinceId} zone {zoneNo}
      </Placeholder>
    )
  }

  const noVotes = zoneStats.noVotes
  // Add no votes as one of candidates.
  const zoneCandidates = [
    ...data.candidates.slice(),
    {
      firstName: "",
      lastName: "",
      no: "",
      score: noVotes,
      partyId: 0,
    },
  ]
  zoneCandidates.sort(function(a, b) {
    return b.score - a.score
  })
  const goodVotes = _.sumBy(zoneCandidates, "score")
  if (data.candidates.length < 1) {
    return (
      <UndesirableState
        heading={
          <span>
            ยังไม่มีพรรคไหน
            <br />
            ได้ที่นั่ง ส.ส.
          </span>
        }
      >
        เริ่มแสดงผลเมื่อนับคะแนนแล้ว 10%
      </UndesirableState>
    )
  }
  return (
    <ul css={{ listStyle: "none", margin: 0, marginTop: 10, padding: 0 }}>
      {zoneCandidates.map((candidate, index) => {
        const party = getPartyById(candidate.partyId)
        const percentage = Math.round((candidate.score / goodVotes) * 100) || 0
        const fullName =
          candidate.firstName || candidate.lastName
            ? `${candidate.firstName} ${candidate.lastName}`
            : ""
        return (
          <li key={candidate.no}>
            <CandidateStatsRow
              candidateName={`${fullName}`}
              candidateNumber={candidate.no}
              partyName={party.name}
              partyColor={party.color}
              rank={index + 1}
              score={candidate.score}
              percentage={percentage}
            />
          </li>
        )
      })}
    </ul>
  )
}
